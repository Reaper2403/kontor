import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Connection,Keypair,PublicKey,Transaction} from '@solana/web3.js';
import {loadOrCreateKeys} from '../chain/bootstrap.mjs';
import {invoiceDocumentDigest} from '../chain/invoice.mjs';
import {Engine} from '../server/engine.js';
import {devnetAdapter} from '../server/devnet.js';
import type {Action,State} from '../contracts/api.js';
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest();
const u64=(v:number)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b;};
let sequence=0;const request=(s:State,type:Action['type'],actor:Action['actor']='executor',extra:Partial<Action>={}):Action=>({type,actor,expectedRevision:s.revision,idempotencyKey:`adapter-release-${++sequence}`,...extra});
function base58(bytes:Buffer){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+bytes.toString('hex')),s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const byte of bytes){if(byte)break;s='1'+s;}return s;}
async function fixture(t:any,{amount=250_000_000,mode='confirmed'}:{amount?:number;mode?:'confirmed'|'failed'|'unknown'|'missing-log'}={}){
 const dir=await mkdtemp(join(tmpdir(),'kontor-release-adapter-')),keys:any=await loadOrCreateKeys(join(dir,'keys'));
 const program=Keypair.generate().publicKey,mint=Keypair.generate().publicKey,recipient=Keypair.generate().publicKey,treasury=Keypair.generate().publicKey;
 const config=PublicKey.findProgramAddressSync([Buffer.from('config'),keys.registrar.publicKey.toBuffer()],program)[0];const obligation=PublicKey.findProgramAddressSync([Buffer.from('obligation'),config.toBuffer(),u64(51)],program)[0];const vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),obligation.toBuffer()],program)[0];const revision=(n:number)=>PublicKey.findProgramAddressSync([Buffer.from('revision'),obligation.toBuffer(),u64(n)],program)[0];
 const handle={id:'51',config:String(config),obligation:String(obligation),vault:String(vault),revisionAddress:String(revision(0)),mint:String(mint),recipient:String(recipient)};
 const model=new Engine();await model.act(request(model.getState(),'apply-credit','reviewer',{amount:200,reference:'CN-RELEASE-ADAPTER',reason:'Accepted service credit'}));for(const actor of ['approver-a','approver-b'] as const)await model.act(request(model.getState(),'approve',actor));await model.act(request(model.getState(),'pay'));
 const before=model.getState();before.mode='devnet';before.asset={symbol:'Test USD',decimals:6,mint:String(mint),cluster:'devnet'};before.invoice.recipient=String(recipient);before.settlement={...before.settlement!,recipient:String(recipient),mode:'devnet',signature:'independent-supplier-payment-signature'};before.chain={programId:String(program),obligation:String(obligation),vault:String(vault),recipientBalance:800,vaultBalance:200,treasury:String(treasury),treasuryBalance:0};
 const invoice=Buffer.from(invoiceDocumentDigest,'hex'),credit=hash(JSON.stringify({reference:before.creditNote!.reference,amount:200})),reason=hash(before.creditNote!.reason),zero=Buffer.alloc(32),expiry=Math.floor(Date.now()/1000)+3600;
 let balance=amount,treasuryBalance=0,lastSignature='',sends=0;const originals=new Map<string,any>();for(const method of ['getAccountInfo','getTokenAccountBalance','getLatestBlockhash','sendRawTransaction','confirmTransaction','getTransaction'])originals.set(method,(Connection.prototype as any)[method]);
 t.after(async()=>{for(const [method,value]of originals)(Connection.prototype as any)[method]=value;await rm(dir,{recursive:true,force:true});});
 (Connection.prototype as any).getAccountInfo=async(address:PublicKey)=>{let data:Buffer;
  if(address.equals(config))data=Buffer.concat([Buffer.from('KNTRCFG2'),...['registrar','reviewer','approverA','approverB'].map(role=>keys[role].publicKey.toBuffer()),mint.toBuffer(),treasury.toBuffer(),keys.registrar.publicKey.toBuffer()]);
  else if(address.equals(obligation))data=Buffer.concat([Buffer.from('KNTROBL2'),config.toBuffer(),u64(51),u64(1_000_000_000),invoice,u64(1),Buffer.from([1]),vault.toBuffer(),recipient.toBuffer(),keys.recipientOwner.publicKey.toBuffer()]);
  else if(address.equals(revision(0))||address.equals(revision(1))){const n=address.equals(revision(1))?1:0;data=Buffer.concat([Buffer.from('KNTRREV1'),obligation.toBuffer(),u64(n),u64(n?800_000_000:1_000_000_000),u64(n?200_000_000:0),n?hash(Buffer.concat([invoice,credit,reason,u64(200_000_000),u64(800_000_000)])):invoice,n?credit:zero,n?reason:zero,u64(expiry),Buffer.from([3]),u64(expiry-3600),u64(expiry-3600),n?keys.reviewer.publicKey.toBuffer():zero]);}
  else throw Error('Unexpected account');return {data,owner:program,executable:false,lamports:1,rentEpoch:0};};
 (Connection.prototype as any).getTokenAccountBalance=async(address:PublicKey)=>({context:{slot:701},value:{amount:String(address.equals(vault)?balance:address.equals(treasury)?treasuryBalance:800_000_000),decimals:6}});
 (Connection.prototype as any).getLatestBlockhash=async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:900});
 (Connection.prototype as any).sendRawTransaction=async(bytes:Buffer)=>{sends++;const tx=Transaction.from(bytes),ix=tx.instructions[1];assert.equal(ix.data[0],5);assert.equal(ix.keys[5].pubkey.toBase58(),String(treasury));assert.equal(ix.keys[3].pubkey.toBase58(),String(vault));lastSignature=base58(tx.signature!);if(mode==='unknown')throw Error('Synthetic lost submission response');if(mode!=='failed'){treasuryBalance+=balance;balance=0;}return lastSignature;};
 (Connection.prototype as any).confirmTransaction=async()=>({context:{slot:700},value:{err:mode==='failed'?{InstructionError:[1,{Custom:7001}]}:null}});
 (Connection.prototype as any).getTransaction=async()=>({slot:700,blockTime:expiry-3600,meta:{err:mode==='failed'?{InstructionError:[1,{Custom:7001}]}:null,logMessages:mode==='failed'?['Program log: Kontor::InvalidAccount']:mode==='missing-log'?[]:[`Program ${program} invoke [1]`,`Program log: Kontor::RemainderReleased amount=${amount}`,`Program ${program} success`],fee:5000,preTokenBalances:[],postTokenBalances:[]}});
 const manifest=join(dir,'manifest.json');await writeFile(manifest,JSON.stringify({rpcUrl:'https://api.devnet.solana.com',programId:String(program),mint:String(mint),recipient:String(recipient),treasury:String(treasury),treasuryOwner:String(keys.registrar.publicKey),keyDir:join(dir,'keys'),handle}));
 const adapter=await devnetAdapter(manifest),engine=new Engine({file:join(dir,'state.json'),effect:adapter.effect,reconcile:adapter.reconcile});await engine.replaceState(before);
 return{adapter,engine,before,sends:()=>sends,signature:()=>lastSignature};
}
for(const amount of [0,1,250_000_000])test(`adapter records transaction-proven remainder ${amount} separately from the supplier payment`,async t=>{
 const f=await fixture(t,{amount});const result=await f.engine.act(request(f.before,'release-remainder'));
 assert.equal(result.treasuryReturn?.amount,amount/1e6);assert.equal(result.treasuryReturn?.signature,f.signature());assert.deepEqual(result.settlement,f.before.settlement);assert.equal(result.chain.recipientBalance,800);assert.equal(result.chain.vaultBalance,0);assert.equal(result.chain.treasuryBalance,amount/1e6);assert.equal(result.evidence.at(-1)?.signature,f.signature());assert.equal(result.evidence.at(-1)?.amount,amount/1e6);assert.equal(result.evidence.at(-1)?.outcome,'confirmed');assert.equal(f.adapter.proofs().length,1);
});
for(const mode of ['failed','unknown','missing-log'] as const)test(`adapter ${mode} return never erases supplier payment or invents return success`,async t=>{
 const f=await fixture(t,{mode});await assert.rejects(f.engine.act(request(f.before,'release-remainder')));const result=f.engine.getState();assert.deepEqual(result.settlement,f.before.settlement);assert.equal(result.treasuryReturn,null);assert.equal(result.status,'paid');assert.equal(result.evidence.filter(x=>x.kind==='treasury-return').length,0);assert.equal(f.adapter.proofs().length,0);
 if(mode!=='failed'){assert.equal(result.operation?.status,'unknown');assert.equal(result.operation?.signature,f.signature());assert.equal(result.operation?.recoverySupported,false);await f.engine.reconcile();assert.equal(f.engine.getState().operation?.status,'unknown');assert.equal(f.sends(),1);}else assert.equal(result.operation,null);
});
for(const field of ['recipient','programId','vault','treasury','mint'] as const)test(`adapter rejects saved ${field} substitution instead of relinking old payment evidence`,async t=>{
 const f=await fixture(t),changed=structuredClone(f.before),address=String(Keypair.generate().publicKey);if(field==='recipient')changed.invoice.recipient=address;else if(field==='mint')changed.asset.mint=address;else changed.chain[field]=address;
 await assert.rejects(f.adapter.link(changed));assert.equal(f.sends(),0);
});
