import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Keypair,Transaction} from '@solana/web3.js';
import {createClient,digest} from '../chain/client.mjs';

let fixtureId=0;
async function fixture(t:any,{phase='confirm',custom=7003}:{phase?:string,custom?:number}={}){
 const keys=Object.fromEntries(['registrar','reviewer','approverA','approverB','executor'].map(role=>[role,Keypair.generate()]));
 const requests:any[]=[],prepared:any[]=[],submitted:any[]=[],sent:Buffer[]=[];
 let blockhashRequests=0,confirmCalls=0,response:any,status=200,transportError=false,malformedJson=false;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(_url:any,init:any)=>{
  const request=JSON.parse(init.body);requests.push(request);assert.equal(request.method,'getTransaction');
  assert.equal(request.params[0],prepared[0].signature);assert.deepEqual(request.params[1],{encoding:'base64',commitment:'confirmed',maxSupportedTransactionVersion:0});
  if(transportError)throw Error('read unavailable');
  return new Response(malformedJson?'invalid JSON':JSON.stringify({jsonrpc:'2.0',id:request.id,result:response}),{status});
 };
 t.after(()=>{globalThis.fetch=originalFetch;});
 const client=createClient({rpcUrl:`http://127.0.0.1:1/failed-${++fixtureId}`,programId:Keypair.generate().publicKey,keys,mint:Keypair.generate().publicKey,recipient:Keypair.generate().publicKey,treasury:Keypair.generate().publicKey,onPrepared:async(p:any)=>{prepared.push(structuredClone(p));},onSubmitted:async(p:any)=>{submitted.push(structuredClone(p));}});
 client.connection.getLatestBlockhash=async()=>{blockhashRequests++;return {blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100};};
 client.connection.sendRawTransaction=async(bytes:any)=>{sent.push(Buffer.from(bytes));assert.equal(prepared.length,1);assert.equal(submitted.length,1);if(phase==='send')throw {InstructionError:[1,{Custom:custom}]};return prepared[0].signature;};
 client.connection.confirmTransaction=async()=>{confirmCalls++;throw {InstructionError:[1,{Custom:custom}]};};
 client.connection.getTransaction=async()=>{throw Error('Fallback must not promote through ordinary record lookup');};
 const signed=await client.testing.signed(client.testing.executeIx({id:'42'},0),keys.executor),wire=signed.tx.serialize().toString('base64');
 response={slot:123,transaction:[wire,'base64'],meta:{err:{InstructionError:[1,{Custom:custom}]},logMessages:[`Program log: Kontor::${custom===7002?'StaleRevision':'AlreadyPaid'}`],preTokenBalances:[],postTokenBalances:[]}};
 function invariant(){
  assert.equal(sent.length,1);assert.equal(blockhashRequests,1);assert.equal(confirmCalls,phase==='send'?0:1);assert.equal(prepared.length,1);assert.deepEqual(submitted,prepared);
  assert.equal(prepared[0].signature,signed.signature);assert.equal(prepared[0].transactionBase64,wire);assert.equal(prepared[0].sha256,digest(sent[0]).toString('hex'));assert.equal(sent[0].toString('base64'),wire);assert.ok(Transaction.from(sent[0]).verifySignatures());assert.equal(requests.length,1);
 }
 return {client,signed,prepared,requests,response,invariant,setResponse:(r:any)=>{response=r;},unavailable:()=>{status=503;},rejectRead:()=>{transportError=true;},malformed:()=>{malformedJson=true;}};
}

for(const phase of ['send','confirm'])for(const custom of [7002,7003])test(`${phase} exception classifies exact confirmed Custom${custom} without a second send`,async t=>{
 const f=await fixture(t,{phase,custom});
 await assert.rejects(f.client.testing.broadcast(f.signed),(error:any)=>error.code===(custom===7002?'StaleRevision':'AlreadyPaid')&&error.confirmation==='failed'&&error.signature===f.signed.signature&&error.evidence.slot===123);
 f.invariant();
});

test('allowFailure returns exact failure evidence after confirmation throws a plain object',async t=>{
 const f=await fixture(t,{custom:7002});const result=await f.client.testing.broadcast(f.signed,{allowFailure:true});
 assert.equal(result.confirmation,'failed');assert.equal(result.signature,f.signed.signature);assert.deepEqual(result.evidence.error,{InstructionError:[1,{Custom:7002}]});f.invariant();
});

const unknownCases=['success','altered-bytes','unseen','missing-meta','missing-error','missing-slot','invalid-slot','wrong-encoding','boolean-error','numeric-error','array-error','empty-object','empty-string','invalid-tuple','negative-custom','oversized-custom','noninteger-custom','extra-error-field','invented-transaction-enum','invented-instruction-enum','unsupported-known-enum','out-of-bounds-instruction','unavailable','read-rejected','malformed-json'] as const;
for(const condition of unknownCases)test(`${condition} remains unknown despite failure exception and logs`,async t=>{
 const f=await fixture(t);
 if(condition==='success')f.response.meta.err=null;
 if(condition==='altered-bytes')f.response.transaction[0]=Buffer.from('different signed bytes').toString('base64');
 if(condition==='unseen')f.setResponse(null);
 if(condition==='missing-meta')delete f.response.meta;
 if(condition==='missing-error')delete f.response.meta.err;
 if(condition==='missing-slot')delete f.response.slot;
 if(condition==='invalid-slot')f.response.slot=-1;
 if(condition==='wrong-encoding')f.response.transaction[1]='json';
 if(condition==='boolean-error')f.response.meta.err=false;
 if(condition==='numeric-error')f.response.meta.err=7003;
 if(condition==='array-error')f.response.meta.err=[];
 if(condition==='empty-object')f.response.meta.err={};
 if(condition==='empty-string')f.response.meta.err='';
 if(condition==='invalid-tuple')f.response.meta.err={InstructionError:['1',{Custom:7003}]};
 if(condition==='negative-custom')f.response.meta.err={InstructionError:[1,{Custom:-1}]};
 if(condition==='oversized-custom')f.response.meta.err={InstructionError:[1,{Custom:4294967296}]};
 if(condition==='noninteger-custom')f.response.meta.err={InstructionError:[1,{Custom:7003.1}]};
 if(condition==='extra-error-field')f.response.meta.err={InstructionError:[1,{Custom:7003}],untrusted:true};
 if(condition==='invented-transaction-enum')f.response.meta.err='ThisIsNotASolanaError';
 if(condition==='invented-instruction-enum')f.response.meta.err={InstructionError:[1,'ThisIsNotASolanaError']};
 if(condition==='unsupported-known-enum')f.response.meta.err='AccountInUse';
 if(condition==='out-of-bounds-instruction')f.response.meta.err={InstructionError:[255,{Custom:7003}]};
 if(condition==='unavailable')f.unavailable();
 if(condition==='read-rejected')f.rejectRead();
 if(condition==='malformed-json')f.malformed();
 await assert.rejects(f.client.testing.broadcast(f.signed,{allowFailure:true}),(error:any)=>{assert.equal(error.code,'UnknownOutcome');assert.equal(error.confirmation,'unknown');assert.equal(error.signature,f.signed.signature);assert.match(error.message,/RPC submission or confirmation did not complete/);assert.doesNotMatch(error.message,/undefined/);return true;});
 f.invariant();
});

test('durable preparation failure still prevents both send and inspection',async t=>{
 const originalFetch=globalThis.fetch;let requests=0,sends=0;
 globalThis.fetch=async()=>{requests++;throw Error('No reads allowed');};t.after(()=>{globalThis.fetch=originalFetch;});
 const keys=Object.fromEntries(['registrar','reviewer','approverA','approverB','executor'].map(role=>[role,Keypair.generate()]));
 const client=createClient({rpcUrl:'http://127.0.0.1:1/no-prepare',programId:Keypair.generate().publicKey,keys,mint:Keypair.generate().publicKey,recipient:Keypair.generate().publicKey,treasury:Keypair.generate().publicKey,onPrepared:async()=>{throw Error('journal unavailable');},onSubmitted:undefined});
 client.connection.getLatestBlockhash=async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100});client.connection.sendRawTransaction=async()=>{sends++;return 'unexpected';};
 const signed=await client.testing.signed(client.testing.executeIx({id:'42'},0),keys.executor);await assert.rejects(client.testing.broadcast(signed),/journal unavailable/);assert.equal(sends,0);assert.equal(requests,0);
});
