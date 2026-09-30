import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Keypair} from '@solana/web3.js';
import {createClient,createPacedRpcFetch,digest} from '../chain/client.mjs';

// Read-only inspection tests intercept every HTTP call. No chain is contacted.
let endpointId=0;
async function fixture(){
 const previousFetch=globalThis.fetch;let result:any=null;const calls:any[]=[];
 globalThis.fetch=async(_url:any,options:any)=>{const request=JSON.parse(options.body);calls.push(request);assert.equal(request.method,'getTransaction');return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result}),{status:200,headers:{'content-type':'application/json'}});};
 const keys=Object.fromEntries(['registrar','reviewer','approverA','approverB','executor'].map(role=>[role,Keypair.generate()]));
 let client:any;try{client=createClient({rpcUrl:`http://127.0.0.1:1/inspect-${endpointId++}`,programId:Keypair.generate().publicKey,mint:Keypair.generate().publicKey,recipient:Keypair.generate().publicKey,treasury:Keypair.generate().publicKey,keys,onPrepared:undefined,onSubmitted:undefined});}finally{globalThis.fetch=previousFetch;}
 client.connection.getLatestBlockhash=async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:12345});
 const signed=await client.testing.signed(client.testing.approveIx({id:'77'},keys.approverA,1),keys.approverA);
 const bytes=signed.tx.serialize();
 const prepared={signature:signed.signature,transactionBase64:bytes.toString('base64'),sha256:digest(bytes).toString('hex'),blockhash:signed.blockhash,lastValidBlockHeight:signed.lastValidBlockHeight,kind:'approve',handle:{id:'77'}};
 const confirmed={slot:321,blockTime:123456,transaction:[prepared.transactionBase64,'base64'],meta:{err:null,logMessages:['confirmed'],fee:5000,preTokenBalances:[],postTokenBalances:[]}};
 result=confirmed;
 return {client,prepared,calls,confirmed,setResult:(value:any)=>{result=value;}};
}

test('inspectPrepared returns the exact successful confirmed bytes and slot using only getTransaction',async()=>{
 const {client,prepared,calls}=await fixture();const result=await client.inspectPrepared(prepared);
 assert.equal(result.transactionBase64,prepared.transactionBase64);assert.equal(result.evidence.signature,prepared.signature);assert.equal(result.evidence.slot,321);assert.equal(result.evidence.error,null);
 assert.deepEqual(calls,[{jsonrpc:'2.0',id:1,method:'getTransaction',params:[prepared.signature,{encoding:'base64',commitment:'confirmed',maxSupportedTransactionVersion:0}]}]);
});

test('inspectPrepared rejects missing or altered durable identity before any RPC',async()=>{
 const {client,prepared,calls}=await fixture();
 for(const changed of [{...prepared,sha256:undefined},{...prepared,sha256:'0'.repeat(64)},{...prepared,signature:'wrong'},{...prepared,blockhash:Keypair.generate().publicKey.toBase58()},{...prepared,transactionBase64:'broken'}]){
  await assert.rejects(client.inspectPrepared(changed),(error:any)=>error.code==='PreparedIdentityMismatch');
 }
 assert.equal(calls.length,0);
});

test('inspectPrepared rejects invalid cryptographic signatures even with a matching recomputed byte hash',async()=>{
 const {client,prepared,calls}=await fixture();const bytes=Buffer.from(prepared.transactionBase64,'base64');bytes[8]^=1;
 await assert.rejects(client.inspectPrepared({...prepared,transactionBase64:bytes.toString('base64'),sha256:digest(bytes).toString('hex')}),(error:any)=>error.code==='PreparedIdentityMismatch');assert.equal(calls.length,0);
});

test('inspectPrepared rejects a different confirmed transaction',async()=>{
 const {client,prepared,confirmed,setResult}=await fixture();const bytes=Buffer.from(prepared.transactionBase64,'base64');bytes[8]^=1;setResult({...confirmed,transaction:[bytes.toString('base64'),'base64']});
 await assert.rejects(client.inspectPrepared(prepared),(error:any)=>error.code==='PreparedIdentityMismatch'&&error.confirmation==='unknown');
});

test('unseen, missing-metadata and unsuccessful transactions never return successful inspection',async()=>{
 for(const outcome of ['unseen','metadata','failed','slot']){
  const {client,prepared,confirmed,setResult,calls}=await fixture();
  setResult(outcome==='unseen'?null:outcome==='metadata'?{...confirmed,meta:null}:outcome==='slot'?{...confirmed,slot:null}:{...confirmed,meta:{...confirmed.meta,err:{InstructionError:[1,{Custom:7000}]}}});
  await assert.rejects(client.inspectPrepared(prepared),(error:any)=>error.signature===prepared.signature&&(outcome==='failed'?error.code==='TransactionFailed'&&error.confirmation==='failed':error.code==='ConfirmationUnavailable'&&error.confirmation==='unknown'));
  assert.equal(calls.length,1);
 }
});

test('HTTP timeout is bounded, aborts the request and does not retry any transport',async()=>{
 let calls=0,signal:AbortSignal|undefined;
 const fetch=createPacedRpcFetch('http://127.0.0.1:1/timeout',{requestTimeoutMs:20,fetchImpl:async(_input:any,init:any)=>{calls++;signal=init.signal;return new Promise(()=>{});}});
 await assert.rejects(fetch('http://127.0.0.1:1/timeout',{method:'POST',body:JSON.stringify({method:'getTransaction'})}),/timed out/);
 assert.equal(calls,1);assert.equal(signal?.aborted,true);
});

test('HTTP timeout also bounds a response body that never completes',async()=>{
 let calls=0;
 const fetch=createPacedRpcFetch('http://127.0.0.1:1/body-timeout',{requestTimeoutMs:20,fetchImpl:async()=>{calls++;return new Response(new ReadableStream<Uint8Array>(),{status:200});}});
 await assert.rejects(fetch('http://127.0.0.1:1/body-timeout',{method:'POST',body:JSON.stringify({method:'getTransaction'})}),/timed out/);assert.equal(calls,1);
});
