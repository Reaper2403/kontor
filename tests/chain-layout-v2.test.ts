import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Keypair,PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {createClient,decodeObligation,releasedAmount} from '../chain/client.mjs';

const key=()=>Keypair.generate().publicKey;
const integer=(value:number)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(value));return b;};
function fixture(){
 const keys=Object.fromEntries(['registrar','reviewer','approverA','approverB','executor'].map(role=>[role,Keypair.generate()]));
 const pid=key(),mint=key(),recipient=key(),recipientOwner=key(),treasury=key();
 const client=createClient({rpcUrl:'http://127.0.0.1:1/v2',programId:pid,keys,mint,recipient,treasury,onPrepared:undefined,onSubmitted:undefined});
 const a=client.addresses({id:'42'}),invoice=Buffer.alloc(32,1),zero=Buffer.alloc(32);
 const obligation=Buffer.concat([Buffer.from('KNTROBL2'),a.config.toBuffer(),integer(42),integer(1000000000),invoice,integer(0),Buffer.from([1]),a.vault.toBuffer(),recipient.toBuffer(),recipientOwner.toBuffer()]);
 const config=Buffer.concat([Buffer.from('KNTRCFG2'),...['registrar','reviewer','approverA','approverB'].map(role=>keys[role].publicKey.toBuffer()),mint.toBuffer(),treasury.toBuffer(),keys.registrar.publicKey.toBuffer()]);
 const revision=Buffer.concat([Buffer.from('KNTRREV1'),a.obligation.toBuffer(),integer(0),integer(1000000000),integer(0),invoice,zero,zero,integer(9999999999),Buffer.from([3]),Buffer.alloc(16),zero]);
 const data=new Map([[a.obligation.toBase58(),obligation],[a.config.toBase58(),config],[a.revision.toBase58(),revision]]);
 client.connection.getAccountInfo=async(address:PublicKey)=>({owner:pid,data:data.get(address.toBase58())}) as any;
 return {client,keys,pid,mint,recipient,recipientOwner,treasury,a,obligation,config,data,handle:{id:'42',recipient:recipient.toBase58()}};
}

test('v2 read binds recipient to obligation and treasury to configuration',async()=>{
 const f=fixture(),state=await f.client.read(f.handle);
 assert.equal(f.obligation.length,193);assert.equal(f.config.length,232);
 assert.equal(state.recipient,f.recipient.toBase58());assert.equal(state.recipientOwner,f.recipientOwner.toBase58());assert.equal(state.treasury,f.treasury.toBase58());assert.equal(state.treasuryOwner,f.keys.registrar.publicKey.toBase58());
 await assert.rejects(f.client.read({...f.handle,recipient:key().toBase58()}),(e:any)=>e.code==='InvalidAccount');
});

test('old v1 layouts are rejected including same-length configuration reinterpretation',async()=>{
 const f=fixture();assert.throws(()=>decodeObligation(f.obligation.subarray(0,129)));
 Buffer.from('KNTROBL1').copy(f.obligation);await assert.rejects(f.client.read(f.handle),/discriminator/);
 Buffer.from('KNTROBL2').copy(f.obligation);Buffer.from('KNTRCFG1').copy(f.config);await assert.rejects(f.client.read(f.handle),/discriminator/);
});

test('instruction destinations follow each obligation while release stays fixed to treasury',()=>{
 const f=fixture(),second=key(),handle={id:'43',recipient:second.toBase58()};
 assert.equal(f.client.testing.executeIx(f.handle,0).keys[6].pubkey.toBase58(),f.recipient.toBase58());
 assert.equal(f.client.testing.executeIx(handle,0).keys[6].pubkey.toBase58(),second.toBase58());
 const create=f.client.testing.createScenarioIx({id:handle.id,recipient:second,invoiceDigest:undefined});assert.equal(create.keys[6].pubkey.toBase58(),second.toBase58());
 const release=f.client.testing.releaseRemainderIx(handle);assert.deepEqual([...release.data],[5]);assert.equal(release.keys.length,7);assert.equal(release.keys[5].pubkey.toBase58(),f.treasury.toBase58());assert.equal(release.keys[2].isWritable,false);assert.equal(release.keys[0].isSigner,true);
});

test('release evidence amount must come from this successful program invocation',()=>{
 const pid=key(),other=TOKEN_PROGRAM_ID;
 const logs=[`Program ${pid} invoke [1]`,`Program ${other} invoke [2]`,`Program ${other} success`,'Program log: Kontor::RemainderReleased amount=200000000',`Program ${pid} success`];
 const evidence={error:null,logs,signature:'test'};assert.equal(releasedAmount(evidence,pid),'200000000');
 assert.equal(releasedAmount({...evidence,logs:[`Program ${pid} invoke [1]`,'Program log: Kontor::RemainderReleased amount=0',`Program ${pid} success`]},pid),'0');
 for(const bad of [
  {error:{InstructionError:[1,'failed']},logs},
  {error:null,logs:logs.slice(0,-1)},
  {error:null,logs:logs.map(line=>line.replace(String(pid),String(key())))},
  {error:null,logs:[...logs.slice(0,-1),'Program log: Kontor::RemainderReleased amount=3',logs.at(-1)!]},
  {error:null,logs:logs.map(line=>line.replace('amount=200000000','amount=18446744073709551616'))},
  {error:null,logs:[`Program ${pid} invoke [1]`,`Program ${other} invoke [2]`,'Program log: Kontor::RemainderReleased amount=200000000',`Program ${other} success`,`Program ${pid} success`]},
 ])assert.throws(()=>releasedAmount(bad,pid),(e:any)=>e.code==='ReleaseEvidenceMismatch');
});

test('release amount and confirmed-slot state refresh survive as distinct evidence',async()=>{
 const f=fixture();f.client.connection.getLatestBlockhash=async()=>({blockhash:key().toBase58(),lastValidBlockHeight:123});
 f.client.connection.sendRawTransaction=async()=> 'test';f.client.connection.confirmTransaction=async()=>({value:{err:null}}) as any;
 f.client.connection.getTransaction=async()=>({slot:42,meta:{err:null,logMessages:[`Program ${f.pid} invoke [1]`,'Program log: Kontor::RemainderReleased amount=7',`Program ${f.pid} success`]}}) as any;
 const result=await f.client.releaseRemainder(f.handle);assert.equal(result.amountReleased,'7');assert.equal(result.state.paid,true);assert.equal(result.state.treasury,f.treasury.toBase58());assert.equal(result.confirmation,'confirmed');
});
