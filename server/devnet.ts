import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {PublicKey} from '@solana/web3.js';
import {createClient} from '../chain/client.mjs';
import {loadOrCreateKeys,fundScenario} from '../chain/bootstrap.mjs';
import type {State,Action} from '../contracts/api.js';
import {DomainError,initialState,type ChainEffect} from './engine.js';
const atomic=async(file:string,value:unknown)=>{await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file+'.tmp',JSON.stringify(value,null,2),{mode:0o600});await rename(file+'.tmp',file);};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export async function devnetAdapter(manifestPath:string){
 const manifest:any=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.rpcUrl!=='https://api.devnet.solana.com')throw Error('Only the explicit public devnet endpoint is supported by this adapter.');
 const directory=dirname(manifestPath);const keys=await loadOrCreateKeys(manifest.keyDir||join(directory,'keys'));
 let lastPrepared:any=null;const proofPath=join(directory,'public-proof.json');let proofs:any[]=[];try{proofs=JSON.parse(await readFile(proofPath,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
 const client=createClient({...manifest,keys,onPrepared:async(tx:any)=>{lastPrepared=tx;await atomic(join(directory,'journal',tx.signature+'.json'),{...tx,status:'prepared',at:new Date().toISOString()});}});
 let handle=manifest.handle??manifest.scenario; if(!handle)throw Error('Manifest requires a setup scenario handle.');
 async function balances(){const [v,r]=await Promise.all([client.connection.getTokenAccountBalance(new PublicKey(handle.vault)),client.connection.getTokenAccountBalance(new PublicKey(handle.recipient))]);return{vaultBalance:Number(v.value.amount)/1e6,recipientBalance:Number(r.value.amount)/1e6};}
 async function link(s:State):Promise<State>{const c=await client.read(handle);const b=await balances();return {...s,mode:'devnet',revision:c.revision+1,asset:{symbol:'Test USD',decimals:6,mint:manifest.mint,cluster:'devnet'},invoice:{...s.invoice,recipient:manifest.recipient},chain:{programId:manifest.programId,obligation:handle.obligation,vault:handle.vault,...b}};}
 const effect:ChainEffect=async(a:Action,before:State,after:State)=>{
  lastPrepared=null;let result:any;
  try{
   if(a.type==='reset'){
    handle=await client.createScenario({invoiceDigest:hash(JSON.stringify(after.invoice))} as any);await fundScenario({client,handle,keys});manifest.handle=handle;delete manifest.capture;await atomic(manifestPath,manifest);return await link(after);
   }
   if(a.type==='approve')result=await client.approve(handle,{actor:a.actor,expectedRevision:a.expectedRevision-1});
   if(a.type==='capture-previous'){manifest.capture=await client.capturePrevious(handle);await atomic(manifestPath,manifest);return await link(after);}
   if(a.type==='apply-credit'){
    // A fresh snapshot immediately before the correction preserves the exact old signed bytes.
    if(before.status==='approved'){manifest.capture=await client.capturePrevious(handle);await atomic(manifestPath,manifest);}
    result=await client.applyCredit(handle,{expectedRevision:a.expectedRevision-1,amount:String(a.amount!*1e6),creditDigest:hash(JSON.stringify({reference:a.reference,amount:a.amount})),reasonDigest:hash(a.reason!)});
   }
   if(a.type==='test-previous'){
    if(!manifest.capture)throw new DomainError('NO_CAPTURE','There is no signed earlier instruction. Start a new scenario and approve the original amount first.');
    result=await client.testPrevious(handle,manifest.capture);
   }
   if(a.type==='pay')result=await client.pay(handle,{expectedRevision:a.expectedRevision-1});
   const c=await client.read(handle);
   if(c.revision+1!==after.revision||Number(c.amountDue)/1e6!==after.amountDue||c.paid!==(after.status==='paid'))throw new DomainError('CONFIRMATION_UNKNOWN','The network state needs reconciliation before another payment.');
   const state=await link(after);const last=state.evidence.at(-1);if(result?.signature&&last){last.signature=result.signature;last.outcome=result.confirmation==='failed'?'failed':'confirmed';}
   if(state.settlement&&result?.signature){state.settlement.signature=result.signature;state.settlement.mode='devnet';}
   if(result){proofs.push({action:a.type,scenarioId:before.scenarioId,signature:result.signature,confirmation:result.confirmation,evidence:result.evidence??null,recordedAt:new Date().toISOString()});await atomic(proofPath,proofs);}
   if(lastPrepared)await atomic(join(directory,'journal',lastPrepared.signature+'.json'),{...lastPrepared,status:result?.confirmation??'confirmed',at:new Date().toISOString()});
   return state;
  }catch(e:any){
   if(lastPrepared&&e.confirmation!=='failed')throw new DomainError('CONFIRMATION_UNKNOWN',`Network outcome requires reconciliation for ${lastPrepared.signature}. No new payment will be sent.`,true);
   if(e instanceof DomainError)throw e;
   throw new DomainError(e.code??'NETWORK_ERROR',e.code==='CaptureExpired'?'The earlier signed instruction expired before the test. Start a new scenario to repeat the control demonstration.':e.message,true);
  }
 };
 const init=await client.read(handle);if(init.paid||init.approvalMask||init.revision) return {effect,link,proofs:()=>proofs,requiresExistingState:true};
 return {effect,link,proofs:()=>proofs,requiresExistingState:false};
}
