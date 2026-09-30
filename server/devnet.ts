import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {PublicKey} from '@solana/web3.js';
import {createClient} from '../chain/client.mjs';
import {invoiceDocument,invoiceDocumentDigest} from '../chain/invoice.mjs';
import {loadOrCreateKeys,fundScenario} from '../chain/bootstrap.mjs';
import type {State,Action} from '../contracts/api.js';
import {DomainError,initialState,type ChainEffect,type PendingIntent,type PreparedTransaction} from './engine.js';
import {validateApprovalIntent,verifyApprovalMessage} from './recovery.js';
const atomic=async(file:string,value:unknown)=>{await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file+'.tmp',JSON.stringify(value,null,2),{mode:0o600});await rename(file+'.tmp',file);};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const hashBytes=(s:string)=>createHash('sha256').update(Buffer.from(s,'base64')).digest('hex');
export async function devnetAdapter(manifestPath:string){
 const manifest:any=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.rpcUrl!=='https://api.devnet.solana.com')throw Error('Only the explicit public devnet endpoint is supported by this adapter.');
 const directory=dirname(manifestPath);const keys=await loadOrCreateKeys(manifest.keyDir||join(directory,'keys'));
 let persistActive:((prepared:PreparedTransaction)=>Promise<void>)|undefined;let lastPrepared:any=null;const proofPath=join(directory,'public-proof.json');let proofs:any[]=[];try{proofs=JSON.parse(await readFile(proofPath,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
 const client=createClient({...manifest,keys,onPrepared:async(tx:any)=>{const prepared={...tx,sha256:hashBytes(tx.transactionBase64)};lastPrepared=prepared;await atomic(join(directory,'journal',tx.signature+'.json'),{...prepared,status:'prepared',at:new Date().toISOString()});await persistActive?.(prepared);}});
 let handle=manifest.handle??manifest.scenario; if(!handle)throw Error('Manifest requires a setup scenario handle.');
 async function balances(){const [v,r,t]=await Promise.all([client.connection.getTokenAccountBalance(new PublicKey(handle.vault)),client.connection.getTokenAccountBalance(new PublicKey(handle.recipient)),client.connection.getTokenAccountBalance(new PublicKey(manifest.treasury))]);return{vaultBalance:Number(v.value.amount)/1e6,recipientBalance:Number(r.value.amount)/1e6,treasuryBalance:Number(t.value.amount)/1e6};}
 async function link(s:State,verifiedState?:Awaited<ReturnType<typeof client.read>>):Promise<State>{const c=verifiedState??await client.read(handle);
 const canonical=client.addresses(handle,0);
 for(const [field,address] of Object.entries({config:canonical.config,obligation:canonical.obligation,vault:canonical.vault,mint:canonical.mint,recipient:canonical.recipient,revisionAddress:canonical.revision}))if(handle[field]!==address.toBase58())throw Error('Manifest scenario account mismatch: '+field);
 if(handle.recipient!==c.recipient)throw Error('Manifest scenario account mismatch: recipient');
 if(s.chain.programId&&s.invoice.recipient!==c.recipient)throw Error('Saved recipient differs from immutable obligation');
 if(s.chain.programId){for(const [label,saved,actual] of [['program',s.chain.programId,manifest.programId],['vault',s.chain.vault,handle.vault],['treasury',s.chain.treasury,c.treasury],['mint',s.asset.mint,c.mint]])if(saved!==actual)throw Error('Saved '+label+' differs from configured payable');}
 if(c.invoiceDigest!==invoiceDocumentDigest)throw Error('On-chain invoice digest does not match the exported original document.');
 const invoiceFields={number:invoiceDocument.invoiceNumber,supplier:invoiceDocument.supplier,supplierEmail:invoiceDocument.supplierEmail,description:invoiceDocument.description,issued:invoiceDocument.issued,due:invoiceDocument.due};
 for(const [field,value] of Object.entries(invoiceFields))if(s.invoice[field as keyof State['invoice']]!==value)throw Error('Saved invoice differs from the committed document: '+field);
 if(s.chain.obligation&&s.chain.obligation!==handle.obligation)throw Error('Saved evidence belongs to a different obligation. Refusing to relink it.');
 const approvedMask=s.approvals.filter(x=>x.current).reduce((mask,x)=>mask|(x.actor==='approver-a'?1:2),0);
 const matches=s.revision===c.revision+1&&s.amountOriginal===Number(c.amountOriginal)/1e6&&s.amountDue===Number(c.amountDue)/1e6&&s.credit===Number(c.credit)/1e6&&(s.status==='paid')===c.paid&&approvedMask===c.approvalMask;
 if(!matches){if(s.operation)return {...s,operation:{...s.operation,status:'unknown',message:'Saved state differs from the network. Reconcile the recorded transaction before another action.'}};throw Error('Saved payable does not match the confirmed program state. Reconciliation required.');}
 if(c.revision>0){const latest=c.history.at(-1);if(!latest||!s.creditNote||s.creditNote.amount!==s.credit||latest.creditDigest!==hash(JSON.stringify({reference:s.creditNote.reference,amount:s.creditNote.amount}))||latest.reasonDigest!==hash(s.creditNote.reason))throw Error('Saved credit does not match the on-chain document digests.');}
 else if(s.creditNote)throw Error('Saved credit has no matching on-chain revision.');
 const b=await balances();return {...s,mode:'devnet',revision:c.revision+1,asset:{symbol:'Test USD',decimals:6,mint:manifest.mint,cluster:'devnet'},invoice:{...s.invoice,recipient:c.recipient},chain:{programId:manifest.programId,obligation:handle.obligation,vault:handle.vault,treasury:c.treasury,...b}};}
 const effect:ChainEffect=async(a:Action,before:State,after:State,persistPrepared)=>{
  persistActive=persistPrepared;lastPrepared=null;let result:any;
  try{
   if(a.type==='reset'){
    handle=await client.createScenario();await fundScenario({client,handle,keys});manifest.handle=handle;delete manifest.capture;await atomic(manifestPath,manifest);return await link(after);
   }
   if(a.type==='approve')result=await client.approve(handle,{actor:a.actor,expectedRevision:a.expectedRevision-1});
   if(a.type==='capture-previous'){manifest.capture=await client.capturePrevious(handle);await atomic(manifestPath,manifest);return await link(after);}
   if(a.type==='apply-credit'){
    // A fresh snapshot immediately before the correction preserves the exact old signed bytes.
    if(before.status==='approved'){manifest.capture=await client.capturePrevious(handle);await atomic(manifestPath,manifest);}
    result=await client.applyCredit(handle,{expectedRevision:a.expectedRevision-1,amount:String(a.amount!*1e6),creditDigest:hash(JSON.stringify({reference:after.creditNote!.reference,amount:after.creditNote!.amount})),reasonDigest:hash(after.creditNote!.reason)});
   }
   if(a.type==='test-previous'){
    if(!manifest.capture)throw new DomainError('NO_CAPTURE','There is no signed earlier instruction. Start a new scenario and approve the original amount first.');
    result=await client.testPrevious(handle,manifest.capture);
   }
   if(a.type==='pay')result=await client.pay(handle,{expectedRevision:a.expectedRevision-1});
   if(a.type==='release-remainder')result=await client.releaseRemainder(handle);
   const c=result?.state??await client.read(handle);
   if(c.revision+1!==after.revision||Number(c.amountDue)/1e6!==after.amountDue||c.paid!==(after.status==='paid'))throw new DomainError('CONFIRMATION_UNKNOWN','The network state needs reconciliation before another payment.');
   const state=await link(after,c);const last=state.evidence.at(-1);if(result?.signature&&last){last.signature=result.signature;last.outcome=result.confirmation==='failed'?'failed':'confirmed';}
   if(a.type==='pay'&&state.settlement&&result?.signature){state.settlement.signature=result.signature;state.settlement.mode='devnet';}
   if(a.type==='release-remainder'){
    if(!state.treasuryReturn||!result?.signature||!/^\d+$/.test(result.amountReleased))throw new DomainError('CONFIRMATION_UNKNOWN','The treasury return requires operator verification. Supplier payment remains confirmed.');
    const amount=Number(result.amountReleased)/1e6;
    state.treasuryReturn={...state.treasuryReturn,amount,signature:result.signature,treasury:c.treasury,mode:'devnet'};
    if(last){last.amount=amount;last.title=`${amount.toLocaleString('en-US')} Test USD returned to treasury`;}
   }
   if(result){const nextProofs=[...proofs,{action:a.type,scenarioId:before.scenarioId,signature:result.signature,confirmation:result.confirmation,evidence:result.evidence??null,recordedAt:new Date().toISOString()}];await atomic(proofPath,nextProofs);proofs=nextProofs;}
   if(lastPrepared)await atomic(join(directory,'journal',lastPrepared.signature+'.json'),{...lastPrepared,status:result?.confirmation??'confirmed',at:new Date().toISOString()});
   return state;
  }catch(e:any){
   if(lastPrepared&&e.confirmation!=='failed')throw new DomainError('CONFIRMATION_UNKNOWN','The operation needs a safe status check. Further actions are paused.',true,lastPrepared.signature);
   if(e instanceof DomainError)throw e;
   throw new DomainError(e.code??'NETWORK_ERROR',e.code==='CaptureExpired'?'The earlier signed instruction expired before the test. Start a new scenario to repeat the control demonstration.':e.message,true);
  }finally{persistActive=undefined;}
 };
 async function reconcile(intent:PendingIntent){
  await validateApprovalIntent(intent);verifyApprovalMessage(intent,client,keys,handle);
  const result=await client.inspectPrepared(intent.prepared!);
  const c=await client.read(handle,{minContextSlot:result.evidence.slot});
  if(c.paid||c.revision!==intent.before.revision-1||c.expiry<=Math.floor(Date.now()/1000))throw new DomainError('RECOVERY_MISMATCH','This approval cannot safely restore the current payable. Operator assistance is required.');
  const state=await link(structuredClone(intent.intendedAfter),c);const last=state.evidence.at(-1)!;last.signature=result.evidence.signature;last.outcome='confirmed';state.operation=null;
  if(!proofs.some(p=>p.signature===result.evidence.signature)){const nextProofs=[...proofs,{action:'approve',scenarioId:intent.before.scenarioId,signature:result.evidence.signature,confirmation:'confirmed',evidence:result.evidence,reconciled:true,legacyBinding:intent.legacyBinding??null,recordedAt:new Date().toISOString()}];await atomic(proofPath,nextProofs);proofs=nextProofs;}
  return state;
 }
 const init=await client.read(handle);if(init.paid||init.approvalMask||init.revision) return {effect,link,reconcile,proofs:()=>proofs,requiresExistingState:true};
 return {effect,link,reconcile,proofs:()=>proofs,requiresExistingState:false};
}
