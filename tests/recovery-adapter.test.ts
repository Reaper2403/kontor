import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Connection,Keypair,PublicKey,Transaction,TransactionInstruction,ComputeBudgetProgram} from '@solana/web3.js';
import {loadOrCreateKeys} from '../chain/bootstrap.mjs';
import {invoiceDocumentDigest} from '../chain/invoice.mjs';
import {Engine,initialState,actionFingerprint,type PendingIntent} from '../server/engine.js';
import {devnetAdapter} from '../server/devnet.js';

const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest();
const u64=(value:number)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(value));return b;};
function base58(bytes:Buffer){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+bytes.toString('hex')),s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const byte of bytes){if(byte)break;s='1'+s;}return s;}

async function fixture(t:any){
 const dir=await mkdtemp(join(tmpdir(),'kontor-recovery-adapter-')),keys:any=await loadOrCreateKeys(join(dir,'keys'));
 const program=Keypair.generate().publicKey,mint=Keypair.generate().publicKey,recipient=Keypair.generate().publicKey, treasury=Keypair.generate().publicKey;
 const config=PublicKey.findProgramAddressSync([Buffer.from('config'),keys.registrar.publicKey.toBuffer()],program)[0];
 const obligation=PublicKey.findProgramAddressSync([Buffer.from('obligation'),config.toBuffer(),u64(42)],program)[0];
 const vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),obligation.toBuffer()],program)[0];
 const revision=(i:number)=>PublicKey.findProgramAddressSync([Buffer.from('revision'),obligation.toBuffer(),u64(i)],program)[0];
 const handle={id:'42',config:String(config),obligation:String(obligation),vault:String(vault),revisionAddress:String(revision(0)),mint:String(mint),recipient:String(recipient)};
 const before=initialState();before.mode='devnet';before.revision=2;before.credit=200;before.amountDue=800;before.creditNote={reference:'CN-RECOVERY',reason:'Service shortfall',amount:200,at:new Date().toISOString()};before.asset={symbol:'Test USD',decimals:6,mint:String(mint),cluster:'devnet'};before.invoice.recipient=String(recipient);before.chain={programId:String(program),obligation:String(obligation),vault:String(vault),recipientBalance:0,vaultBalance:1000,treasury:String(treasury),treasuryBalance:0};
 const action={type:'approve' as const,actor:'approver-a' as const,expectedRevision:2,idempotencyKey:'adapter-recovery-request'};
 const model=new Engine();await model.replaceState(before);const after=await model.act(action);
 const ix=new TransactionInstruction({programId:program,keys:[{pubkey:keys.approverA.publicKey,isSigner:true,isWritable:false},{pubkey:config,isSigner:false,isWritable:false},{pubkey:obligation,isSigner:false,isWritable:true},{pubkey:revision(1),isSigner:false,isWritable:true}],data:Buffer.concat([Buffer.from([2]),u64(1)])});
 const blockhash=Keypair.generate().publicKey.toBase58(),tx=new Transaction({feePayer:keys.approverA.publicKey,recentBlockhash:blockhash}).add(ComputeBudgetProgram.setComputeUnitLimit({units:200007}),ix);tx.sign(keys.approverA);const bytes=tx.serialize();
 const intent:PendingIntent={action,before,intendedAfter:after,fingerprint:actionFingerprint(action),preparedAt:after.approvals.at(-1)!.at,prepared:{signature:base58(tx.signature!),transactionBase64:bytes.toString('base64'),sha256:hash(bytes).toString('hex'),blockhash,lastValidBlockHeight:900,kind:'approve',handle}};
 const state={mask:1,paid:false,revision:1,amount:800_000_000,expiry:Math.floor(Date.now()/1000)+3600,badCredit:false,badEvidence:false};
 const invoice=Buffer.from(invoiceDocumentDigest,'hex'),credit=hash(JSON.stringify({reference:before.creditNote.reference,amount:200})),reason=hash(before.creditNote.reason),zero=Buffer.alloc(32);
 const contexts:any[]=[];let recording=false,readCalls=0;
 const originalAccount=Connection.prototype.getAccountInfo,originalBalance=Connection.prototype.getTokenAccountBalance,originalSend=Connection.prototype.sendRawTransaction,originalFetch=globalThis.fetch,originalSign=Transaction.prototype.sign;
 (Connection.prototype as any).getAccountInfo=async(address:PublicKey,context:any)=>{
  if(recording){contexts.push(context);readCalls++;}
  let data:Buffer;
  if(address.equals(config))data=Buffer.concat([Buffer.from('KNTRCFG2'),...['registrar','reviewer','approverA','approverB'].map(role=>keys[role].publicKey.toBuffer()),mint.toBuffer(),treasury.toBuffer(),keys.registrar.publicKey.toBuffer()]);
  else if(address.equals(obligation))data=Buffer.concat([Buffer.from('KNTROBL2'),config.toBuffer(),u64(42),u64(1_000_000_000),invoice,u64(state.revision),Buffer.from([Number(state.paid)]),vault.toBuffer(),recipient.toBuffer(),keys.recipientOwner.publicKey.toBuffer()]);
  else if(address.equals(revision(0))||address.equals(revision(1))){const i=address.equals(revision(1))?1:0;const evidence=state.badEvidence?zero:hash(Buffer.concat([invoice,credit,reason,u64(200_000_000),u64(800_000_000)]));data=Buffer.concat([Buffer.from('KNTRREV1'),obligation.toBuffer(),u64(i),u64(i?state.amount:1_000_000_000),u64(i?200_000_000:0),i?evidence:invoice,i?(state.badCredit?zero:credit):zero,i?reason:zero,u64(state.expiry),Buffer.from([i?state.mask:3]),u64(Math.floor(Date.now()/1000)),u64(0),i?keys.reviewer.publicKey.toBuffer():zero]);}
  else throw Error('Unexpected account read');
  return {data,owner:program,executable:false,lamports:1,rentEpoch:0};
 };
 (Connection.prototype as any).getTokenAccountBalance=async(address:PublicKey)=>({context:{slot:702},value:{amount:address.equals(vault)?'1000000000':'0',decimals:6,uiAmount:address.equals(vault)?1000:0,uiAmountString:address.equals(vault)?'1000':'0'}});
 (Connection.prototype as any).sendRawTransaction=async()=>{throw Error('Recovery cannot send a transaction');};
 (Transaction.prototype as any).sign=()=>{throw Error('Recovery cannot sign a transaction');};
 const rpcMethods:string[]=[];
 globalThis.fetch=async(_url:any,options:any)=>{const q=JSON.parse(options.body);rpcMethods.push(q.method);assert.equal(q.method,'getTransaction');return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result:{slot:700,transaction:[intent.prepared!.transactionBase64,'base64'],meta:{err:null,logMessages:[],fee:5000,preTokenBalances:[],postTokenBalances:[]}}}),{status:200});};
 t.after(async()=>{Connection.prototype.getAccountInfo=originalAccount;Connection.prototype.getTokenAccountBalance=originalBalance;Connection.prototype.sendRawTransaction=originalSend;Transaction.prototype.sign=originalSign;globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});});
 const manifest=join(dir,'manifest.json');await writeFile(manifest,JSON.stringify({rpcUrl:'https://api.devnet.solana.com',programId:String(program),mint:String(mint),recipient:String(recipient),treasury:String(treasury),keyDir:join(dir,'keys'),handle}));
 const adapter=await devnetAdapter(manifest);recording=true;
 return{adapter,intent,state,contexts,rpcMethods,dir,reads:()=>readCalls};
}

test('adapter reconciles exact approved snapshot using confirmed minimum slot and no signer/send',async t=>{
 const f=await fixture(t);const recovered=await f.adapter.reconcile(f.intent);
 assert.equal(recovered.approvals.filter(x=>x.current).length,1);assert.equal(recovered.settlement,null);assert.equal(recovered.evidence.at(-1)?.signature,f.intent.prepared!.signature);
 assert.ok(f.contexts.length>=4);assert.ok(f.contexts.every(x=>x.commitment==='confirmed'&&x.minContextSlot>=700));assert.deepEqual(f.rpcMethods,['getTransaction']);
});

for(const condition of ['missing-mask','later-approval','advanced-revision','paid','expired','changed-amount','changed-credit-digest'] as const)test(`adapter refuses ${condition} despite exact successful signature`,async t=>{
 const f=await fixture(t);
 if(condition==='missing-mask')f.state.mask=0;
 if(condition==='later-approval')f.state.mask=3;
 if(condition==='advanced-revision')f.state.revision=2;
 if(condition==='paid')f.state.paid=true;
 if(condition==='expired')f.state.expiry=Math.floor(Date.now()/1000)-1;
 if(condition==='changed-amount')f.state.amount=700_000_000;
 if(condition==='changed-credit-digest')f.state.badCredit=true;
 await assert.rejects(f.adapter.reconcile(f.intent));assert.equal(f.adapter.proofs().length,0);
});

test('auxiliary proof write failure stays retryable and does not poison proof deduplication',async t=>{
 const f=await fixture(t),proof=join(f.dir,'public-proof.json');await mkdir(proof+'.tmp');
 await assert.rejects(f.adapter.reconcile(f.intent));assert.equal(f.adapter.proofs().length,0);
 await rm(proof+'.tmp',{recursive:true});await f.adapter.reconcile(f.intent);
 const durable=JSON.parse(await readFile(proof,'utf8'));assert.equal(durable.length,1);assert.equal(durable[0].signature,f.intent.prepared!.signature);
 await f.adapter.reconcile(f.intent);assert.equal(JSON.parse(await readFile(proof,'utf8')).length,1);
});
