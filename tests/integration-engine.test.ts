import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {Engine} from '../server/engine.js';
import type {Action, Actor, State} from '../contracts/api.js';

let counter = 0;
function request(state: State, type: Action['type'], actor: Actor, extra: Partial<Action> = {}): Action {
  return {type, actor, expectedRevision: state.revision, idempotencyKey: `independent-test-${++counter}`, ...extra};
}
async function fixture(t: any) {
  const directory = await mkdtemp(join(tmpdir(), 'kontor-integration-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const file = join(directory, 'state.json');
  const engine = new Engine({file});
  await engine.load();
  return {engine, file};
}
async function approveBoth(engine: Engine) {
  await engine.act(request(engine.getState(), 'approve', 'approver-a'));
  await engine.act(request(engine.getState(), 'approve', 'approver-b'));
}
function financialState(state: State) {
  return {scenarioId: state.scenarioId, revision: state.revision, credit: state.credit,
    amountDue: state.amountDue, status: state.status, approvals: state.approvals,
    settlement: state.settlement, chain: state.chain};
}

test('one identity cannot provide two-person payment authority', async t => {
  const {engine} = await fixture(t);
  await engine.act(request(engine.getState(), 'approve', 'approver-a'));
  try { await engine.act(request(engine.getState(), 'approve', 'approver-a')); } catch {}
  assert.notEqual(engine.getState().status, 'approved');
  await assert.rejects(engine.act(request(engine.getState(), 'pay', 'executor')));
  assert.equal(engine.getState().settlement, null);
});

test('wrong personas cannot approve or apply a credit', async t => {
  const {engine} = await fixture(t);
  for (const actor of ['reviewer', 'executor'] as Actor[]) {
    const before = financialState(engine.getState());
    await assert.rejects(engine.act(request(engine.getState(), 'approve', actor)));
    assert.deepEqual(financialState(engine.getState()), before);
  }
  for (const actor of ['approver-a', 'approver-b', 'executor'] as Actor[]) {
    const before = financialState(engine.getState());
    await assert.rejects(engine.act(request(engine.getState(), 'apply-credit', actor, {amount: 200, reference:'CN-TEST', reason:'Service shortfall'})));
    assert.deepEqual(financialState(engine.getState()), before);
  }
});

test('credit invalidates old approvals; stale normal requests cannot mutate financial state', async t => {
  const {engine} = await fixture(t);
  await approveBoth(engine);
  const oldRevision = engine.getState().revision;
  await engine.act(request(engine.getState(), 'apply-credit', 'reviewer', {amount:200, reference:'CN-TEST', reason:'Service shortfall'}));
  const state = engine.getState();
  assert.equal(state.amountOriginal, 1000);
  assert.equal(state.credit, 200);
  assert.equal(state.amountDue, 800);
  assert.ok(state.revision > oldRevision);
  assert.equal(state.status, 'needs-approval');
  assert.equal(state.approvals.filter(a => a.current).length, 0);
  assert.equal(state.approvals.filter(a => a.revision === oldRevision).length, 2);
  for (const [type, actor] of [['approve','approver-a'], ['pay','executor'], ['apply-credit','reviewer']] as const) {
    const before = financialState(engine.getState());
    await assert.rejects(engine.act(request(state, type, actor, {expectedRevision:oldRevision, amount:200, reference:'CN-OTHER', reason:'Second credit'})));
    assert.deepEqual(financialState(engine.getState()), before);
  }
  await assert.rejects(engine.act(request(engine.getState(), 'pay', 'executor')));
  await approveBoth(engine);
  await engine.act(request(engine.getState(), 'pay', 'executor'));
  assert.equal(engine.getState().settlement?.amount, 800);
  assert.equal(engine.getState().status, 'paid');
});

test('same credit request is idempotent across restart and cannot reuse key for a different payload', async t => {
  const {engine, file} = await fixture(t);
  const action = request(engine.getState(), 'apply-credit', 'reviewer', {amount:200, reference:'CN-TEST', reason:'Service shortfall'});
  await engine.act(action);
  const before = financialState(engine.getState());
  await engine.act(action);
  assert.deepEqual(financialState(engine.getState()), before);
  const restarted = new Engine({file});
  await restarted.load();
  await restarted.act(action);
  assert.deepEqual(financialState(restarted.getState()), before);
  await assert.rejects(restarted.act({...action, amount:100, reference:'CN-DIFFERENT'}));
  assert.deepEqual(financialState(restarted.getState()), before);
});

test('execute-first stays permanently paid across replay, revision attempts and restart', async t => {
  const {engine, file} = await fixture(t);
  await approveBoth(engine);
  const pay = request(engine.getState(), 'pay', 'executor');
  await engine.act(pay);
  const settled = engine.getState().settlement;
  assert.equal(settled?.amount, 1000);
  await engine.act(pay);
  const restarted = new Engine({file});
  await restarted.load();
  try { await restarted.act(request(restarted.getState(), 'pay', 'executor')); } catch {}
  await assert.rejects(restarted.act(request(restarted.getState(), 'apply-credit', 'reviewer', {amount:200, reference:'CN-LATE', reason:'After payment'})));
  assert.equal(restarted.getState().status, 'paid');
  assert.deepEqual(restarted.getState().settlement, settled);
  assert.equal(restarted.getState().evidence.filter(e => e.kind === 'payment').length, 1);
});

test('simultaneous repeated payment creates one settlement and one payment evidence item', async t => {
  const {engine} = await fixture(t);
  await approveBoth(engine);
  const results = await Promise.allSettled(Array.from({length:8}, () => engine.act(request(engine.getState(), 'pay', 'executor'))));
  assert.ok(results.some(r => r.status === 'fulfilled'));
  assert.equal(engine.getState().status, 'paid');
  assert.equal(engine.getState().settlement?.amount, 1000);
  assert.equal(engine.getState().evidence.filter(e => e.kind === 'payment').length, 1);
});

test('rehearsal receipts do not invent blockchain transaction evidence', async t => {
  const {engine} = await fixture(t);
  assert.equal(engine.getState().mode, 'rehearsal');
  await approveBoth(engine);
  await engine.act(request(engine.getState(), 'pay', 'executor'));
  const state = engine.getState();
  assert.equal(state.asset.symbol, 'Test USD');
  assert.equal(state.asset.cluster, 'local');
  assert.equal(state.settlement?.mode, 'rehearsal');
  assert.equal(state.settlement?.signature, null);
  assert.ok(state.evidence.every(e => !e.signature));
  assert.doesNotMatch(JSON.stringify(state), /secretKey|privateKey|transactionBase64/);
});

test('invalid credit values and invalid actor/action inputs do not mutate financial state', async t => {
  const {engine} = await fixture(t);
  const before = financialState(engine.getState());
  const badActions = [
    ...[-1, 0, 1001, NaN, Infinity].map(amount => request(engine.getState(), 'apply-credit', 'reviewer', {amount, reference:'CN-BAD', reason:'Bad amount'})),
    request(engine.getState(), 'approve', 'outsider' as Actor),
    request(engine.getState(), 'destroy' as Action['type'], 'reviewer'),
    request(engine.getState(), 'approve', 'approver-a', {expectedRevision: -1}),
    request(engine.getState(), 'approve', 'approver-a', {expectedRevision: NaN}),
  ];
  for (const action of badActions) {
    await assert.rejects(engine.act(action), JSON.stringify(action));
    assert.deepEqual(financialState(engine.getState()), before);
  }
});

test('in-flight chain effect is durable before an outbound payment can complete', async t => {
  const {engine, file} = await fixture(t);
  await approveBoth(engine);
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const sender = new Engine({file, effect:async () => { entered(); await blocked; }});
  await sender.load();
  const payment = sender.act(request(sender.getState(), 'pay', 'executor'));
  await started;
  try {
    const restarted = new Engine({file});
    await restarted.load();
    assert.equal(restarted.getState().operation?.status, 'pending', 'outbound payment intent must be saved before calling chain effect');
    await assert.rejects(restarted.act(request(restarted.getState(), 'pay', 'executor')));
  } finally {
    release();
    await payment;
  }
});

test('unknown external result blocks fresh payment after restart without fabricating settlement', async t => {
  const {engine, file} = await fixture(t);
  await approveBoth(engine);
  let sends = 0;
  const sender = new Engine({file, effect:async () => {
    sends++;
    throw Object.assign(new Error('Confirmation not yet known'), {code:'CONFIRMATION_UNKNOWN', signature:'mock-signature-for-service-test'});
  }});
  await sender.load();
  await assert.rejects(sender.act(request(sender.getState(), 'pay', 'executor')));
  assert.equal(sender.getState().settlement, null);
  assert.equal(sender.getState().operation?.status, 'unknown');
  const restarted = new Engine({file, effect:async () => { sends++; }});
  await restarted.load();
  await assert.rejects(restarted.act(request(restarted.getState(), 'pay', 'executor')));
  assert.equal(sends, 1);
  assert.equal(restarted.getState().evidence.filter(e => e.kind === 'payment').length, 0);
});

for (const first of ['apply-credit', 'pay'] as const) {
  test(`credit/payment race serializes when ${first} arrives first`, async t => {
    const {engine} = await fixture(t);
    await approveBoth(engine);
    const snapshot = engine.getState();
    const credit = request(snapshot, 'apply-credit', 'reviewer', {amount:200, reference:'CN-RACE', reason:'Service shortfall'});
    const pay = request(snapshot, 'pay', 'executor');
    const actions = first === 'apply-credit' ? [credit, pay] : [pay, credit];
    const results = await Promise.allSettled(actions.map(action => engine.act(action)));
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    const final = engine.getState();
    if (first === 'apply-credit') {
      assert.equal(final.amountDue, 800);
      assert.equal(final.settlement, null);
      assert.equal(final.chain.recipientBalance, snapshot.chain.recipientBalance);
    } else {
      assert.equal(final.credit, 0);
      assert.equal(final.settlement?.amount, 1000);
      assert.equal(final.status, 'paid');
    }
  });
}

test('previous-approval rehearsal rejects stale authorization without any balance movement', async t => {
  const {engine} = await fixture(t);
  await approveBoth(engine);
  await engine.act(request(engine.getState(), 'capture-previous', 'executor'));
  await engine.act(request(engine.getState(), 'apply-credit', 'reviewer', {amount:200, reference:'CN-OLD', reason:'Service shortfall'}));
  const before = financialState(engine.getState());
  await engine.act(request(engine.getState(), 'test-previous', 'executor'));
  assert.deepEqual(financialState(engine.getState()), before);
  assert.equal(engine.getState().previousInstruction?.tested, true);
  assert.equal(engine.getState().evidence.filter(e => e.kind === 'blocked').length, 1);
  assert.equal(engine.getState().evidence.find(e => e.kind === 'blocked')?.signature, undefined);
});

test('retrying reset preserves the first replacement scenario identity across restart', async t => {
  const {engine, file} = await fixture(t);
  const original = engine.getState().scenarioId;
  const action = request(engine.getState(), 'reset', 'reviewer');
  await engine.act(action);
  const replacement = engine.getState().scenarioId;
  assert.notEqual(replacement, original);
  await engine.act(action);
  assert.equal(engine.getState().scenarioId, replacement);
  const restarted = new Engine({file});
  await restarted.load();
  await restarted.act(action);
  assert.equal(restarted.getState().scenarioId, replacement);
});

test('unknown credit outcome retains committed document inputs for later reconciliation', async t => {
  const {file} = await fixture(t);
  const engine = new Engine({file, effect:async()=>{
    throw Object.assign(new Error('Synthetic confirmation response loss'),{code:'CONFIRMATION_UNKNOWN'});
  }});
  await engine.load();
  const action=request(engine.getState(),'apply-credit','reviewer',{
    amount:200,reference:'CN-RECOVERY-UNIQUE-481',reason:'Recovered exact committed reason 7261',
  });
  await assert.rejects(engine.act(action));
  assert.equal(engine.getState().creditNote,null,'unconfirmed change must not be presented as confirmed');
  const durable=await readFile(file,'utf8');
  assert.ok(durable.includes(action.reference!),'document reference must survive a lost result');
  assert.ok(durable.includes(action.reason!),'document reason must survive a lost result');
  assert.ok(durable.includes(action.idempotencyKey),'reconciliation must retain request identity');
});
