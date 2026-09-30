import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {Keypair,Transaction,TransactionInstruction,ComputeBudgetProgram,PublicKey} from '@solana/web3.js';
import {createClient} from '../chain/client.mjs';

const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function base58(bytes:Buffer){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+bytes.toString('hex')),s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const byte of bytes){if(byte)break;s='1'+s;}return s;}
let port=28000;
function fixture(t:any,onPrepared:any=undefined){
 const keys:any=Object.fromEntries(['registrar','reviewer','approverA','approverB','executor'].map(role=>[role,Keypair.generate()]));
 const program=Keypair.generate().publicKey,blockhash=Keypair.generate().publicKey.toBase58();
 const ix=new TransactionInstruction({programId:program,keys:[{pubkey:keys.approverA.publicKey,isSigner:true,isWritable:false}],data:Buffer.from([2,0,0,0,0,0,0,0,0])});
 const tx=new Transaction({feePayer:keys.approverA.publicKey,recentBlockhash:blockhash}).add(ComputeBudgetProgram.setComputeUnitLimit({units:200000}),ix);tx.sign(keys.approverA);
 const bytes=tx.serialize();const prepared:any={signature:base58(tx.signature!),transactionBase64:bytes.toString('base64'),sha256:digest(bytes),blockhash,lastValidBlockHeight:900,kind:'approve',handle:{id:'42'}};
 const record:any={slot:700,transaction:[prepared.transactionBase64,'base64'],meta:{err:null,logMessages:['Synthetic confirmed approval'],fee:5000,preTokenBalances:[],postTokenBalances:[]}};
 let result:any=record;const requests:any[]=[];let httpStatus=200;
 const original=globalThis.fetch;
 globalThis.fetch=async(_url:any,init:any)=>{const body=JSON.parse(init.body);requests.push(body);assert.equal(body.method,'getTransaction','recovery may not submit, sign, simulate or request replacement blockhash');return new Response(JSON.stringify(httpStatus===200?{jsonrpc:'2.0',id:body.id,result}:{error:'synthetic unavailable'}),{status:httpStatus,headers:{'content-type':'application/json','retry-after':'0'}});};
 t.after(()=>{globalThis.fetch=original;});
 const client=createClient({rpcUrl:`http://127.0.0.1:${++port}`,programId:program,keys,mint:Keypair.generate().publicKey,recipient:Keypair.generate().publicKey,onPrepared,onSubmitted:undefined});
 // Any accidental high-level write is an immediate independent failure.
 (client.connection as any).sendRawTransaction=async()=>{throw Error('Forbidden send during reconciliation');};
 return {client,prepared,record,requests,setResult:(value:any)=>{result=value;},setStatus:(value:number)=>{httpStatus=value;}};
}

test('confirmed base64 inspection binds exact signed bytes through read-only RPC',async t=>{
 const f=fixture(t);const result=await f.client.inspectPrepared(f.prepared);
 assert.equal(result.evidence.signature,f.prepared.signature);assert.equal(result.evidence.slot,700);
 assert.equal(result.transactionBase64,f.prepared.transactionBase64);assert.equal(f.requests.length,1);
 assert.deepEqual(f.requests[0].params,[f.prepared.signature,{encoding:'base64',commitment:'confirmed',maxSupportedTransactionVersion:0}]);
});

for(const field of ['signature','sha256','blockhash','transactionBase64'] as const)test(`tampered prepared ${field} is rejected before RPC`,async t=>{
 const f=fixture(t);f.prepared[field]=field==='sha256'?'0'.repeat(64):'tampered';
 await assert.rejects(f.client.inspectPrepared(f.prepared));assert.equal(f.requests.length,0);
});

for(const condition of ['unseen','failed','different-wire','missing-meta','missing-error','invalid-slot','unknown-encoding'] as const)test(`confirmed inspection rejects ${condition}`,async t=>{
 const f=fixture(t);
 if(condition==='unseen')f.setResult(null);
 if(condition==='failed')f.record.meta.err={InstructionError:[1,{Custom:7002}]};
 if(condition==='different-wire')f.record.transaction[0]=Buffer.from('another successful transaction').toString('base64');
 if(condition==='missing-meta')delete f.record.meta;
 if(condition==='missing-error')delete f.record.meta.err;
 if(condition==='invalid-slot')f.record.slot=-1;
 if(condition==='unknown-encoding')f.record.transaction[1]='json';
 await assert.rejects(f.client.inspectPrepared(f.prepared));assert.equal(f.requests.length,1);
});

test('rate-limited inspection is bounded and never uses a send RPC',async t=>{
 const f=fixture(t);f.setStatus(429);
 await assert.rejects(f.client.inspectPrepared(f.prepared));assert.ok(f.requests.length>=1&&f.requests.length<=3);
 assert.ok(f.requests.every(x=>x.method==='getTransaction'));
});

test('durable preparation failure aborts before broadcast',async t=>{
 const f=fixture(t,async()=>{throw Error('Synthetic durable preparation failure');});let sends=0;
 (f.client.connection as any).sendRawTransaction=async()=>{sends++;throw Error('Must not send');};
 const tx=Transaction.from(Buffer.from(f.prepared.transactionBase64,'base64'));
 await assert.rejects(f.client.testing.broadcast({tx,...f.prepared}),/durable preparation failure/);
 assert.equal(sends,0);assert.equal(f.requests.length,0);
});
