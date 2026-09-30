import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App, { type TourPresentation } from '../src/App';
import { projectRecordedState, recordedEvidenceHref, recordedProofLinks, tourSteps } from '../tour/recorded-state';
import recorded from '../tour/public/recorded-evidence.json';

const scene = (id: string) => {
  const value = tourSteps.find(step => step.id === id);
  assert.ok(value, `Missing scene ${id}`);
  return value;
};

test('each named approval is preserved separately, and only current-version approvals authorize readiness', () => {
  const counts: Record<string, number> = { start: 0, 'approval-a': 1, 'approved-original': 2, 'credit-applied': 0, 'old-instruction-blocked': 0, 'approval-new-a': 1, 'approved-revised': 2 };
  for (const [id, count] of Object.entries(counts)) {
    const { state } = scene(id);
    assert.equal(state.approvals.filter(approval => approval.current).length, count, id);
    assert.equal(state.status, count === 2 ? 'approved' : 'needs-approval', id);
  }
  assert.equal(scene('approval-a').state.approvals[0].name, 'Mara Weber');
  assert.equal(scene('approved-original').state.approvals[1].name, 'Jonas Berg');
  assert.equal(scene('credit-applied').state.approvals.every(approval => !approval.current), true);
  assert.equal(scene('credit-applied').state.creditNote?.reference, 'CN-204');
  assert.equal(scene('credit-applied').state.amountDue, 800);
});

test('historical projections have exact event prefixes, no future settlement or balances, and independent mutable objects', () => {
  for (const step of tourSteps) {
    const { state } = step;
    assert.equal(state.scenarioId, recorded.provenance.scenarioId);
    assert.deepEqual(state.evidence, recorded.state.evidence.slice(0, state.evidence.length));
    assert.equal(state.operation, null);
    if (state.status !== 'paid') {
      assert.equal(state.settlement, null);
      assert.equal(state.chain.vaultBalance, null);
      assert.equal(state.chain.recipientBalance, null);
    }
  }
  assert.equal(scene('approved-original').state.previousInstruction?.tested, false);
  assert.equal(scene('approved-original').state.previousInstruction?.outcome, undefined);
  assert.equal(scene('old-instruction-blocked').state.previousInstruction?.tested, true);
  const copy = projectRecordedState(1);
  copy.invoice.number = 'Changed';
  assert.equal(projectRecordedState(1).invoice.number, recorded.state.invoice.number);
  assert.throws(() => projectRecordedState(0));
  assert.throws(() => projectRecordedState(9));
  assert.throws(() => projectRecordedState(1.5));
});

test('selected public proofs match exact recorded events and distinguish rejected transaction from settlement', () => {
  const events = recorded.state.evidence.filter(event => 'signature' in event);
  assert.equal(events.length, 7);
  assert.equal(recorded.networkProofs.length, events.length);
  assert.deepEqual(recorded.networkProofs.map(proof => proof.signature).sort(), events.map(event => event.signature).sort());
  assert.equal(recorded.networkProofs.every(proof => proof.scenarioId === recorded.state.scenarioId), true);
  const blocked = recorded.networkProofs.find(proof => proof.action === 'test-previous')!;
  assert.equal(blocked.confirmation, 'failed');
  assert.equal(blocked.evidence.tokenMovement, '0');
  assert.ok(blocked.evidence.logs.includes('Program log: Kontor::StaleRevision'));
  assert.equal(scene('paid').state.status, 'paid');
  assert.equal(scene('paid').state.settlement?.signature, recorded.state.settlement.signature);
  assert.equal(recordedProofLinks.blocked, `https://explorer.solana.com/tx/${blocked.signature}?cluster=devnet`);
  assert.equal(recordedProofLinks.payment, `https://explorer.solana.com/tx/${recorded.state.settlement.signature}?cluster=devnet`);
  assert.equal(recordedEvidenceHref.startsWith('/'), false);
});

test('tour renders real workbench without live mutation controls or API export paths in every scene', () => {
  for (const step of tourSteps) {
    const html = renderToStaticMarkup(createElement<{ tour?: TourPresentation }>(App, { tour: { ...step, evidenceHref: recordedEvidenceHref } }));
    assert.ok(html.includes('Recorded devnet · Static replay'), step.id);
    assert.ok(!html.includes('/api/'), step.id);
    assert.ok(!html.includes('Reset demonstration'), step.id);
    assert.ok(!html.includes('Apply supplier credit'), step.id);
    assert.ok(!html.includes('Test previous approval'), step.id);
    assert.ok(!html.includes('id="actor"'), step.id);
    assert.ok(!/>Approve [\d,]+ Test USD</.test(html), step.id);
    assert.ok(!/>Pay [\d,]+ Test USD</.test(html), step.id);
  }
});

test('payment review is opt-in and never blocks arrival with an automatic dialog', () => {
  const step = scene('payment-review');
  const html = renderToStaticMarkup(createElement<{ tour?: TourPresentation }>(App, { tour: { ...step, evidenceHref: recordedEvidenceHref, onShowRecordedPayment: () => {} } }));
  assert.ok(html.includes('Inspect recorded payment review'));
  assert.ok(!html.includes('<dialog'));
  assert.ok(!html.includes('Show recorded payment result'));
  assert.ok(!html.includes('Confirm 800 Test USD'));
  assert.ok(!html.includes('This sends test tokens'));
});

test('default App remains live workspace loading presentation', () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.ok(html.includes('Opening your workspace'));
  assert.ok(!html.includes('Static replay'));
});
