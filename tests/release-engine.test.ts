import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Engine,DomainError,type ChainEffect} from '../server/engine.js';
import type {Action,Actor,State} from '../contracts/api.js';
let sequence=0;
const action=(s:State,type:Action['type'],actor:Actor='executor',extra:Partial<Action>={}):Action=>({type,actor,expectedRevision:s.revision,idempotencyKey:`release-integration-${++sequence}`,...extra});
async function fixture(t:any,credit=200){
 const dir=await mkdtemp(join(tmpdir(),'kontor-release-engine-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'state.json'),engine=new Engine({file});await engine.load();
 if(credit)await engine.act(action(engine.getState(),'apply-credit','reviewer',{amount:credit,reference:'CN-RELEASE',reason:'Accepted service credit'}));
 for(const actor of ['approver-a','approver-b'] as const)await engine.act(action(engine.getState(),'approve',actor));
 return{engine,file};
}
const invariant=(s:State)=>({status:s.status,revision:s.revision,amount:s.amountDue,approvals:s.approvals,settlement:s.settlement,recipient:s.invoice.recipient,recipientBalance:s.chain.recipientBalance});

test('reserve return is blocked before payment and for every non-operator app role',async t=>{
 const {engine}=await fixture(t);const approved=engine.getState();
 await assert.rejects(engine.act(action(approved,'release-remainder')),{code:'PAYMENT_REQUIRED'});assert.deepEqual(engine.getState(),approved);
 await engine.act(action(engine.getState(),'pay'));const paid=engine.getState();
 for(const role of ['reviewer','approver-a','approver-b'] as const){await assert.rejects(engine.act(action(paid,'release-remainder',role)),{code:'ROLE_NOT_ALLOWED'});assert.deepEqual(engine.getState(),paid);}
});

for(const [credit,funding,remainder] of [[200,1000,200],[200,1425,625],[0,1250,250],[0,1000,0]])test(`return uses actual reserve ${funding} less payment, with credit ${credit}`,async t=>{
 const {engine}=await fixture(t,credit);const funded=engine.getState();funded.chain.vaultBalance=funding;await engine.replaceState(funded);
 await engine.act(action(engine.getState(),'pay'));const paid=engine.getState();await engine.act(action(paid,'release-remainder'));const returned=engine.getState();
 assert.equal(returned.treasuryReturn?.amount,remainder);assert.equal(returned.chain.vaultBalance,0);assert.equal(returned.chain.treasuryBalance,remainder);assert.deepEqual(invariant(returned),invariant(paid));
 assert.equal(returned.treasuryReturn?.signature,null);assert.equal(returned.evidence.at(-1)?.outcome,'local');assert.ok(returned.evidence.every(x=>!x.signature));
});

test('return request survives duplicate replay and restart; empty repeat and later dust leave payment unchanged',async t=>{
 const {engine,file}=await fixture(t);await engine.act(action(engine.getState(),'pay'));const paid=engine.getState(),request=action(paid,'release-remainder');await engine.act(request);
 const once=engine.getState();await engine.act(request);assert.deepEqual(engine.getState(),once);
 const restarted=new Engine({file});await restarted.load();await restarted.act(request);assert.deepEqual(restarted.getState(),once);
 await restarted.act(action(restarted.getState(),'release-remainder'));assert.equal(restarted.getState().treasuryReturn?.amount,0);assert.equal(restarted.getState().chain.treasuryBalance,200);
 const donated=restarted.getState();donated.chain.vaultBalance=0.000001;await restarted.replaceState(donated);await restarted.act(action(donated,'release-remainder'));
 assert.equal(restarted.getState().treasuryReturn?.amount,0.000001);assert.equal(restarted.getState().chain.treasuryBalance,200.000001);assert.deepEqual(invariant(restarted.getState()),invariant(paid));
 await assert.rejects(restarted.act(action(restarted.getState(),'pay')),{code:'ALREADY_PAID'});await assert.rejects(restarted.act(action(restarted.getState(),'approve','approver-a')),{code:'ALREADY_PAID'});
});

for(const unknown of [false,true])test(`${unknown?'unknown':'failed'} return preserves confirmed payment and ${unknown?'locks across restart':'permits explicit retry'}`,async t=>{
 const {engine,file}=await fixture(t);await engine.act(action(engine.getState(),'pay'));const paid=engine.getState();paid.mode='devnet';paid.settlement!.mode='devnet';paid.settlement!.signature='supplier-settlement-signature';await engine.replaceState(paid);
 let sends=0;const effect:ChainEffect=async(_a,_b,_c,persist)=>{sends++;await persist!({signature:'distinct-return-signature',transactionBase64:'test-fixture',sha256:'test-fixture',blockhash:'fixture',lastValidBlockHeight:12,kind:'release-remainder',handle:{}});throw new DomainError(unknown?'CONFIRMATION_UNKNOWN':'InvalidAccount','Synthetic return failure');};
 const sender=new Engine({file,effect});await sender.load();await assert.rejects(sender.act(action(sender.getState(),'release-remainder')));const failed=sender.getState();assert.deepEqual(invariant(failed),invariant(paid));assert.equal(failed.treasuryReturn,null);assert.equal(failed.chain.vaultBalance,200);assert.equal(failed.evidence.filter(x=>x.kind==='treasury-return').length,0);
 const restarted=new Engine({file,effect});await restarted.load();
 if(unknown){assert.equal(failed.operation?.signature,'distinct-return-signature');assert.equal(failed.operation?.recoverySupported,false);for(const type of ['release-remainder','pay','reset'] as const)await assert.rejects(restarted.act(action(restarted.getState(),type)),{code:'CONFIRMATION_PENDING'});const checked=await restarted.reconcile();assert.equal(checked.operation?.status,'unknown');assert.deepEqual(invariant(checked),invariant(paid));assert.equal(sends,1);}
 else{assert.equal(failed.operation,null);await assert.rejects(restarted.act(action(restarted.getState(),'release-remainder')));assert.equal(sends,2);}
});
