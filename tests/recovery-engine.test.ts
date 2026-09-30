import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Engine,DomainError} from '../server/engine.js';
import type {State,Action} from '../contracts/api.js';

// Mocked verifier tests: this file validates local orchestration, not chain proof.
let sequence=0;
const request=(s:State,type:Action['type'],actor:Action['actor'],extra:Partial<Action>={}):Action=>({type,actor,expectedRevision:s.revision,idempotencyKey:`recovery-test-${++sequence}`,...extra});
const prepared={signature:'synthetic-verifier-signature',transactionBase64:'c3ludGhldGlj',sha256:'a'.repeat(64),blockhash:'synthetic-blockhash',lastValidBlockHeight:900,kind:'approve',handle:{id:'42'}};
async function fixture(t:any,second=false){
 const dir=await mkdtemp(join(tmpdir(),'kontor-recovery-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'state.json');const setup=new Engine({file});await setup.load();
 await setup.act(request(setup.getState(),'approve','approver-a'));
 await setup.act(request(setup.getState(),'approve','approver-b'));
 await setup.act(request(setup.getState(),'apply-credit','reviewer',{amount:200,reference:'CN-RECOVERY',reason:'Service shortfall'}));
 if(second)await setup.act(request(setup.getState(),'approve','approver-a'));
 const before=setup.getState();const action=request(before,'approve',second?'approver-b':'approver-a');
 let effectCalls=0;
 const sender=new Engine({file,effect:async(_a:any,_b:any,_s:any,persist:any)=>{effectCalls++;await persist(prepared);throw new DomainError('CONFIRMATION_UNKNOWN','Uncertain synthetic approval');}});
 await sender.load();await assert.rejects(sender.act(action));
 const stored=JSON.parse(await readFile(file,'utf8'));
 return {dir,file,before,action,stored,effectCalls};
}
function confirmed(intent:any):State{
 const state=structuredClone(intent.intendedAfter);
 const event=state.evidence.at(-1)!;event.signature=intent.prepared.signature;event.outcome='confirmed';state.operation=null;
 return state;
}
function accounting(state:State){const {operation,...rest}=state;return rest;}

for(const second of [false,true])test(`exact ${second?'second':'first'} revised approval reconciles once without effects`,async t=>{
 const {file,before,action}=await fixture(t,second);let verifications=0,sends=0;
 const engine=new Engine({file,effect:async()=>{sends++;throw Error('Recovery must not invoke outbound effect');},reconcile:async(intent:any)=>{verifications++;return confirmed(intent);}});
 await engine.load();const result=await engine.reconcile();
 assert.equal(result.operation,null);assert.equal(result.status,second?'approved':'needs-approval');
 assert.equal(result.approvals.filter(x=>x.current).length,second?2:1);assert.equal(result.settlement,null);
 assert.deepEqual(result.evidence.slice(0,-1),before.evidence);assert.deepEqual(result.chain,before.chain);
 assert.equal(result.evidence.at(-1)?.signature,prepared.signature);
 const once=engine.getState();
 await Promise.all([engine.reconcile(),engine.reconcile(),engine.reconcile()]);
 await engine.act(action);
 assert.deepEqual(engine.getState(),once);assert.equal(verifications,1);assert.equal(sends,0);
 const restarted=new Engine({file,reconcile:async()=>{throw Error('Completed recovery cannot rerun verifier');}});await restarted.load();
 await restarted.reconcile();await restarted.act(action);assert.deepEqual(restarted.getState(),once);
 assert.equal(JSON.parse(await readFile(file,'utf8')).pendingIntent,undefined);
});

test('parallel checks serialize and append the original event only once',async t=>{
 const {file,stored}=await fixture(t);let calls=0;
 const engine=new Engine({file,reconcile:async(intent:any)=>{calls++;await Promise.resolve();return confirmed(intent);}});await engine.load();
 const results=await Promise.all([engine.reconcile(),engine.reconcile(),engine.reconcile()]);
 assert.equal(calls,1);assert.ok(results.every(x=>x.evidence.at(-1)?.id===stored.pendingIntent.intendedAfter.evidence.at(-1).id));
 assert.equal(engine.getState().evidence.filter(x=>x.id===stored.pendingIntent.intendedAfter.evidence.at(-1).id).length,1);
});

for(const reason of ['UNSEEN','UNCONFIRMED','FAILED','RPC_429','STALE_SNAPSHOT','SIGNATURE_MISMATCH'])test(`unresolved ${reason} retains accounting and durable intent`,async t=>{
 const {file,before}=await fixture(t);const engine=new Engine({file,reconcile:async()=>{throw new DomainError(reason,'Verification did not establish confirmation');}});await engine.load();
 try{await engine.reconcile();}catch{}
 assert.deepEqual(accounting(engine.getState()),accounting(before));assert.ok(engine.getState().operation);
 assert.ok(JSON.parse(await readFile(file,'utf8')).pendingIntent);
 await assert.rejects(engine.act(request(engine.getState(),'approve','approver-b')));
});

test('tampered intended state cannot import a settlement through approved recovery',async t=>{
 const {file,stored}=await fixture(t);stored.pendingIntent.intendedAfter.settlement={amount:800,signature:'forged',at:new Date().toISOString(),recipient:'forged',mode:'devnet'};
 await writeFile(file,JSON.stringify(stored));let calls=0;
 const engine=new Engine({file,reconcile:async(intent:any)=>{calls++;return confirmed(intent);}});await engine.load();
 try{await engine.reconcile();}catch{}
 assert.equal(calls,0,'invalid legal delta must be rejected before chain reconciliation');
 assert.equal(engine.getState().settlement,null);assert.ok(engine.getState().operation);
});

test('unsupported credit intent remains locked without calling approval verifier',async t=>{
 const {file,stored}=await fixture(t);stored.pendingIntent.action.type='apply-credit';await writeFile(file,JSON.stringify(stored));let calls=0;
 const engine=new Engine({file,reconcile:async(intent:any)=>{calls++;return confirmed(intent);}});await engine.load();
 try{await engine.reconcile();}catch{}
 assert.equal(calls,0);assert.ok(engine.getState().operation);
});

test('failed recovery persistence cannot clear the in-memory or durable operation lock',async t=>{
 const {file,before}=await fixture(t);const engine=new Engine({file,reconcile:async(intent:any)=>{await mkdir(file+'.tmp');return confirmed(intent);}});await engine.load();
 try{await engine.reconcile();}catch{}
 assert.ok(engine.getState().operation,'failed save must not unlock memory');
 assert.deepEqual(accounting(engine.getState()),accounting(before));
 const durable=JSON.parse(await readFile(file,'utf8'));assert.ok(durable.state.operation);assert.ok(durable.pendingIntent);
});

test('saved intent for another current scenario cannot replace the authoritative state',async t=>{
 const {file,stored}=await fixture(t);stored.state.scenarioId='different-current-scenario';await writeFile(file,JSON.stringify(stored));let calls=0;
 const engine=new Engine({file,reconcile:async(intent:any)=>{calls++;return confirmed(intent);}});await engine.load();
 try{await engine.reconcile();}catch{}
 assert.equal(calls,0,'current state and intent before-state must agree before verification');
 assert.equal(engine.getState().scenarioId,'different-current-scenario');assert.ok(engine.getState().operation);
});

test('public unresolved approval metadata excludes private snapshots and signed bytes',async t=>{
 const {file}=await fixture(t);const engine=new Engine({file});await engine.load();const state=engine.getState();
 assert.equal(state.operation?.actor,'approver-a');assert.equal(state.operation?.amount,800);assert.equal(state.operation?.signature,prepared.signature);
 assert.doesNotMatch(JSON.stringify(state),/pendingIntent|intendedAfter|transactionBase64|secretKey|privateKey/);
});

test('new pay request queued behind first-approval recovery cannot bypass second approval',async t=>{
 const {file}=await fixture(t);let sends=0;
 const engine=new Engine({file,effect:async()=>{sends++;},reconcile:async(intent:any)=>confirmed(intent)});await engine.load();
 const pay=request(engine.getState(),'pay','executor');const results=await Promise.allSettled([engine.reconcile(),engine.act(pay)]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(sends,0);assert.equal(engine.getState().settlement,null);
});
