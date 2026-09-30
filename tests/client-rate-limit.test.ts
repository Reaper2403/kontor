import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Keypair, PublicKey, Transaction} from '@solana/web3.js';
import {createClient,createPacedRpcFetch} from '../chain/client.mjs';

// Transport-only tests: every request is intercepted; no RPC or chain mutation.
const request=(method:string)=>({method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]})});
const url=(name:string)=>`http://127.0.0.1:1/${name}`;
function clock(){let now=0;return {now:()=>now,sleep:async(ms:number)=>{now+=ms;}};}

test('endpoint queue is shared across clients and spaces all HTTP starts',async()=>{
 const c=clock(),starts:number[]=[];
 const options={...c,fetchImpl:async()=>{starts.push(c.now());return new Response('{}',{status:200});}};
 const first=createPacedRpcFetch(url('shared'),options),second=createPacedRpcFetch(url('shared'),options);
 await Promise.all([first(url('shared'),request('getAccountInfo')),second(url('shared'),request('simulateTransaction')),first(url('shared'),request('sendTransaction'))]);
 assert.deepEqual(starts,[0,350,700]);
});

test('429 read retries are limited to two and Retry-After is capped',async()=>{
 const c=clock(),starts:number[]=[];
 const fetch=createPacedRpcFetch(url('read-retry'),{...c,fetchImpl:async()=>{starts.push(c.now());return new Response('limited',{status:429,headers:{'Retry-After':'9999'}});}});
 const result=await fetch(url('read-retry'),request('getAccountInfo'));
 assert.equal(result.status,429);assert.deepEqual(starts,[0,2000,4000]);
});

test('mutating and unknown methods never receive a transport retry',async()=>{
 for(const method of ['sendTransaction','requestAirdrop','unknownMethod']){
  const c=clock();let calls=0;const fetch=createPacedRpcFetch(url(method),{...c,fetchImpl:async()=>{calls++;return new Response('limited',{status:429});}});
  assert.equal((await fetch(url(method),request(method))).status,429);assert.equal(calls,1);
 }
});

test('transport rejection releases the endpoint queue without retrying',async()=>{
 const c=clock();let calls=0;const starts:number[]=[];
 const fetch=createPacedRpcFetch(url('rejection'),{...c,fetchImpl:async()=>{calls++;starts.push(c.now());if(calls===1)throw Error('connection lost');return new Response('{}',{status:200});}});
 await assert.rejects(fetch(url('rejection'),request('getAccountInfo')),/connection lost/);
 await fetch(url('rejection'),request('getAccountInfo'));assert.equal(calls,2);assert.deepEqual(starts,[0,350]);
});

function fixture(rpcUrl:string,onPrepared?:any){
 const keys=Object.fromEntries(['registrar','reviewer','approverA','approverB','executor'].map(k=>[k,Keypair.generate()]));
 const programId=Keypair.generate().publicKey,mint=Keypair.generate().publicKey,recipient=Keypair.generate().publicKey;
 const client=createClient({rpcUrl,programId,keys,mint,recipient,onPrepared,onSubmitted:undefined});
 const handle={id:'44'},a=client.addresses(handle),integer=(n:number)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
 const invoice=Buffer.alloc(32,1),zero=Buffer.alloc(32);
 const obligation=Buffer.concat([Buffer.from('KNTROBL1'),a.config.toBuffer(),integer(44),integer(1_000_000_000),invoice,integer(0),Buffer.from([0]),a.vault.toBuffer()]);
 const revision=Buffer.concat([Buffer.from('KNTRREV1'),a.obligation.toBuffer(),integer(0),integer(1_000_000_000),integer(0),invoice,zero,zero,integer(Math.floor(Date.now()/1000)+3600),Buffer.from([3]),Buffer.alloc(16),zero]);
 const config=Buffer.concat([Buffer.from('KNTRCFG1'),keys.registrar.publicKey.toBuffer(),keys.reviewer.publicKey.toBuffer(),keys.approverA.publicKey.toBuffer(),keys.approverB.publicKey.toBuffer(),mint.toBuffer(),recipient.toBuffer(),Keypair.generate().publicKey.toBuffer()]);
 const accountData=new Map([[a.obligation.toBase58(),obligation],[a.revision.toBase58(),revision],[a.config.toBase58(),config]]);
 const reads:any[]=[];
 const connection=client.connection as any;
 connection.getAccountInfo=async(key:PublicKey,options:any)=>{reads.push(options);return {owner:programId,data:accountData.get(key.toBase58())};};
 connection.getLatestBlockhash=async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:999});
 return {client,connection,handle,reads,obligation};
}

test('action refresh applies the confirmed transaction slot to every account read',async()=>{
 const {client,connection,handle,reads,obligation}=fixture(url('minimum-slot'));
 connection.sendRawTransaction=async()=> 'signature';connection.confirmTransaction=async()=>({value:{err:null}});
 connection.getTransaction=async()=>({slot:321,meta:{err:null,logMessages:[],fee:5000,preTokenBalances:[],postTokenBalances:[]}});
 obligation[96]=1;
 const result=await client.pay(handle,{expectedRevision:0});
 assert.equal(result.confirmation,'confirmed');assert.equal(result.state.paid,true);assert.equal(reads.length,3);
 for(const config of reads)assert.deepEqual(config,{commitment:'confirmed',minContextSlot:321});
});

test('actual web3 transport send429 is attempted once and preserves the prepared signature',async()=>{
 const previousFetch=globalThis.fetch;let calls=0,prepared:any;
 try{
  globalThis.fetch=async()=>{calls++;assert.ok(prepared.signature);return new Response('limited',{status:429});};
  const {client,handle}=fixture(url('web3-send429'),async(value:any)=>{prepared=value;});
  await assert.rejects(client.pay(handle,{expectedRevision:0}),(error:any)=>{assert.equal(error.confirmation,'unknown');assert.equal(error.signature,prepared.signature);assert.ok(Transaction.from(Buffer.from(prepared.transactionBase64,'base64')).verifySignatures());return true;});
  assert.equal(calls,1);
 }finally{globalThis.fetch=previousFetch;}
});

test('web3 reads and raw capture simulation use the same paced HTTP queue',async()=>{
 const previousFetch=globalThis.fetch;const starts:{method:string,at:number}[]=[];
 try{
  globalThis.fetch=async(_input:any,init:any)=>{const body=JSON.parse(init.body);starts.push({method:body.method,at:Date.now()});return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result:body.method==='getBlockHeight'?10:{context:{slot:10},value:{err:null,logs:[]}}}),{status:200,headers:{'content-type':'application/json'}});};
  const {client,handle}=fixture(url('raw-simulation'));
  await client.connection.getBlockHeight('confirmed');await client.capturePrevious(handle);
  assert.deepEqual(starts.map(x=>x.method),['getBlockHeight','simulateTransaction']);assert.ok(starts[1].at-starts[0].at>=340,'raw simulation must observe the same 350ms queue');
 }finally{globalThis.fetch=previousFetch;}
});
