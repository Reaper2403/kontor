import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import type {State,Action,Actor,Evidence} from '../contracts/api.js';
export class DomainError extends Error {constructor(public code:string,message:string,public retryable=false,public signature?:string){super(message);}}
export interface PreparedTransaction {signature:string;transactionBase64:string;sha256:string;blockhash:string;lastValidBlockHeight:number;kind:string;handle:any}
export interface PendingIntent {action:Action;before:State;intendedAfter:State;fingerprint:string;preparedAt:string;prepared?:PreparedTransaction;legacyBinding?:unknown}
export type ChainEffect=(action:Action,before:State,after:State,persistPrepared?:(prepared:PreparedTransaction)=>Promise<void>)=>Promise<Partial<State>|void>;
export type ReconcileEffect=(intent:PendingIntent)=>Promise<State>;
export const actionFingerprint=(a:Action)=>createHash('sha256').update(JSON.stringify({type:a.type,actor:a.actor,expectedRevision:a.expectedRevision,amount:a.amount??null,reference:a.reference??null,reason:a.reason??null})).digest('hex');
const people:State['people']=[{id:'reviewer',name:'Lena Fischer',role:'Finance reviewer'},{id:'approver-a',name:'Mara Weber',role:'Finance lead'},{id:'approver-b',name:'Jonas Berg',role:'Team lead'},{id:'executor',name:'Alex Morgan',role:'Payment operator'}];
const now=()=>new Date().toISOString();
export function initialState():State {const at=now();return {mode:'rehearsal',scenarioId:randomUUID(),revision:1,asset:{symbol:'Test USD',decimals:6,mint:null,cluster:'local'},invoice:{id:'inv-'+randomUUID().slice(0,8),number:'NF-2026-041',supplier:'Northform Studio',supplierEmail:'accounts@northform.example',description:'Product design support · September 2026',issued:'2026-09-24',due:'2026-10-08',recipient:'Northform Studio · demonstration recipient'},amountOriginal:1000,credit:0,amountDue:1000,status:'needs-approval',creditNote:null,approvals:[],evidence:[{id:randomUUID(),kind:'created',title:'Invoice ready for review',detail:'Synthetic invoice for 1,000 Test USD. Two distinct approvals are required.',at,actor:'Demo registrar',revision:1,amount:1000,outcome:'local'}],settlement:null,previousInstruction:null,operation:null,people,chain:{programId:null,obligation:null,vault:null,recipientBalance:0,vaultBalance:2000}};}
interface Stored {pendingIntent?:PendingIntent;archive?:State[];state:State;idempotency:Record<string,{fingerprint:string;scenarioId:string}>}
export class Engine {
 private data:Stored={state:initialState(),idempotency:{}};private queue:Promise<unknown>=Promise.resolve();private effect?:ChainEffect;
 constructor(private options:{file?:string;effect?:ChainEffect;reconcile?:ReconcileEffect}={}){this.effect=options.effect;}
 async load(){if(this.options.file){try{this.data=JSON.parse(await readFile(this.options.file,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;await this.save();}}return this.getState();}
 getState():State{const s=structuredClone(this.data.state),i=this.data.pendingIntent;if(s.operation&&i){const a=i.action;const label=a.type==='approve'?'approval':a.type==='apply-credit'?'credit':a.type==='pay'?'payment':'operation';s.operation={...s.operation,actor:a.actor,amount:a.type==='apply-credit'?a.amount:i.intendedAfter.amountDue,signature:i.prepared?.signature,recoverySupported:a.type==='approve'&&Boolean(i.prepared),message:'The '+label+' needs confirmation. Further actions are paused.'};}return s;}
 async replaceState(state:State){this.data.state=structuredClone(state);await this.save();}
 private async save(){if(!this.options.file)return;await mkdir(dirname(this.options.file),{recursive:true});const tmp=this.options.file+'.tmp';await writeFile(tmp,JSON.stringify(this.data,null,2),{mode:0o600});await rename(tmp,this.options.file);}
 act(input:Action):Promise<State>{const result=this.queue.then(()=>this.perform(input));this.queue=result.catch(()=>{});return result;}
 private async persistPrepared(prepared:PreparedTransaction){if(!this.data.pendingIntent)throw Error('No durable operation intent');this.data.pendingIntent.prepared=structuredClone(prepared);await this.save();}
 reconcile():Promise<State>{const result=this.queue.then(()=>this.performReconcile());this.queue=result.catch(()=>{});return result;}
 private async performReconcile():Promise<State>{
  if(!this.data.state.operation)return this.getState();
  const intent=this.data.pendingIntent;
  try{
   if(!intent||!intent.prepared||intent.action.type!=='approve'||!this.options.reconcile)throw new DomainError('OPERATOR_REQUIRED','This operation needs operator assistance. It has not been resubmitted.');
   const savedBefore=structuredClone(this.data.state);savedBefore.operation=null;
   if(!isDeepStrictEqual(savedBefore,intent.before)||this.data.idempotency[intent.action.idempotencyKey])throw new DomainError('RECOVERY_MISMATCH','The saved operation no longer matches this payable. Operator assistance is required.');
   await validateApprovalIntent(intent);
   const recovered=await this.options.reconcile(structuredClone(intent));
   const event=recovered.evidence.at(-1);
   if(recovered.operation||!event||event.signature!==intent.prepared.signature||event.outcome!=='confirmed')throw new DomainError('RECOVERY_MISMATCH','Confirmation did not match the saved approval. The payable remains locked.');
   // The verifier may refresh balances and attach the actual signature, but cannot import other state.
   const expected=structuredClone(intent.intendedAfter);expected.chain={...expected.chain,vaultBalance:recovered.chain.vaultBalance,recipientBalance:recovered.chain.recipientBalance};expected.evidence.at(-1)!.signature=event.signature;expected.evidence.at(-1)!.outcome='confirmed';
   if(!isDeepStrictEqual(expected,recovered))throw new DomainError('RECOVERY_MISMATCH','The recovered record differs from the saved approval.');
   const previous=this.data;
   this.data={...structuredClone(previous),state:recovered,idempotency:{...previous.idempotency,[intent.action.idempotencyKey]:{fingerprint:intent.fingerprint,scenarioId:recovered.scenarioId}}};delete this.data.pendingIntent;
   try{await this.save();}catch(error){this.data=previous;throw error;}
   return this.getState();
  }catch(error){
   const operation=this.data.state.operation;if(operation){operation.status='unknown';operation.lastCheckedAt=now();operation.lastCheckMessage=error instanceof DomainError?error.message:'Confirmation could not be established. The payable remains locked; no action was resubmitted.';await this.save();}
   return this.getState();
  }
 }
 private async perform(input:Action):Promise<State>{
  const a=input as Action;if(!a||typeof a!=='object'||!['approve','apply-credit','capture-previous','test-previous','pay','reset'].includes(a.type)||!people.some(p=>p.id===a.actor))throw new DomainError('INVALID_ACTION','Choose a valid action and demonstration role.');
  if(typeof a.idempotencyKey!=='string'||a.idempotencyKey.length<8||a.idempotencyKey.length>160)throw new DomainError('INVALID_REQUEST','This action needs a unique request reference.');
  if(!Number.isSafeInteger(a.expectedRevision)||a.expectedRevision<1)throw new DomainError('INVALID_REVISION','Refresh the payable before trying again.');
  const fingerprint=actionFingerprint(a);
  const prior=this.data.idempotency[a.idempotencyKey];
  if(prior){if(prior.fingerprint!==fingerprint||prior.scenarioId!==this.data.state.scenarioId)throw new DomainError('REQUEST_CONFLICT','That request reference belongs to a different action. Refresh and try again.');return this.getState();}
  const before=this.getState(),s=structuredClone(before);if(s.operation)throw new DomainError('CONFIRMATION_PENDING','The previous network result is unresolved. Reconcile it before another action.',true);
  if(a.expectedRevision!==s.revision)throw new DomainError('STALE_VIEW','This payable changed. Review the latest amount before acting.',true);
  const person=people.find(p=>p.id===a.actor)!;
  const add=(kind:Evidence['kind'],title:string,detail:string,amount?:number,outcome:Evidence['outcome']='local')=>s.evidence.push({id:randomUUID(),kind,title,detail,at:now(),actor:person.name,revision:s.revision,amount,outcome});
  const allow=(...roles:Actor[])=>{if(!roles.includes(a.actor))throw new DomainError('ROLE_NOT_ALLOWED','Switch to the authorised demonstration role for this action.');};
  const unpaid=()=>{if(s.status==='paid')throw new DomainError('ALREADY_PAID','This payable is already settled. Its payment cannot be repeated or recalled.');};
  if(a.type==='reset'){
   allow('reviewer','executor');const next=initialState();next.mode=s.mode;next.asset=s.asset;
   if(this.effect){this.data.pendingIntent={action:structuredClone(a),before:structuredClone(before),intendedAfter:structuredClone(next),fingerprint,preparedAt:now()};this.data.state.operation={type:a.type,status:'pending',message:'Creating a new test obligation.'};await this.save();try{Object.assign(next,await this.effect(a,before,next,p=>this.persistPrepared(p)));}catch(e:any){this.data.state=before;if(e.code==='CONFIRMATION_UNKNOWN')this.data.state.operation={type:a.type,status:'unknown',message:e.message};else delete this.data.pendingIntent;await this.save();throw e;}}
   delete this.data.pendingIntent;this.data.archive=[...(this.data.archive??[]),before];this.data.state=next;this.data.idempotency={[a.idempotencyKey]:{fingerprint,scenarioId:next.scenarioId}};await this.save();return this.getState();
  }
  if(a.type==='approve'){
   allow('approver-a','approver-b');unpaid();if(s.approvals.some(p=>p.actor===a.actor&&p.current))throw new DomainError('ALREADY_APPROVED','You already approved this amount. The other approver must review it.');
   s.approvals.push({actor:a.actor,name:person.name,role:person.role,revision:s.revision,amount:s.amountDue,at:now(),current:true});
   add('approval',`${person.name} approved ${s.amountDue.toLocaleString('en-US')} Test USD`,'Approval covers this amount, recipient and current invoice version.',s.amountDue);
   if(s.approvals.filter(p=>p.current).length===2){s.status='approved';if(!s.previousInstruction)s.previousInstruction={revision:s.revision,amount:s.amountDue,capturedAt:now(),tested:false};}
  } else if(a.type==='apply-credit'){
   allow('reviewer');unpaid();if(s.creditNote)throw new DomainError('CREDIT_ALREADY_APPLIED','The demonstration credit has already been applied. Start a new scenario to try another.');
   if(!Number.isSafeInteger(a.amount)||a.amount!<=0||a.amount!>=s.amountDue)throw new DomainError('INVALID_CREDIT','Enter a whole Test USD amount greater than zero and less than the amount due.');
   if(typeof a.reference!=='string'||!a.reference.trim()||a.reference.length>80||typeof a.reason!=='string'||!a.reason.trim()||a.reason.length>300)throw new DomainError('CREDIT_DETAILS_REQUIRED','Add a credit-note reference and a short reason.');
   s.credit=a.amount!;s.amountDue-=a.amount!;s.revision++;s.status='needs-approval';s.approvals=s.approvals.map(p=>({...p,current:false}));s.creditNote={reference:a.reference.trim(),reason:a.reason.trim(),amount:a.amount!,at:now()};
   add('credit',`${a.amount} Test USD credit applied`,`${a.reference.trim()}: ${a.reason.trim()}. Earlier approvals no longer cover the revised amount.`,a.amount);
  } else if(a.type==='capture-previous'){
   allow('executor');unpaid();if(s.status!=='approved')throw new DomainError('APPROVALS_REQUIRED','Both named approvers must approve before retaining a payment instruction.');
   if(s.previousInstruction&&s.previousInstruction.revision!==s.revision)throw new DomainError('PREVIOUS_INSTRUCTION_RETAINED','The earlier instruction is already retained for comparison.');
   s.previousInstruction={revision:s.revision,amount:s.amountDue,capturedAt:now(),tested:false};add('capture','Approved instruction retained','Demonstration control: retain the current authorisation for a later comparison.',s.amountDue);
  } else if(a.type==='test-previous'){
   allow('executor');const old=s.previousInstruction;if(!old)throw new DomainError('NO_PREVIOUS_APPROVAL','First obtain both approvals for the original invoice.');
   if(old.revision===s.revision&&s.status!=='paid')throw new DomainError('INSTRUCTION_STILL_CURRENT','This approval is still current. Apply a credit before testing its replacement.');
   if(old.tested)throw new DomainError('ALREADY_TESTED','The previous instruction has already been checked. Its result is in Evidence.');
   old.tested=true;old.outcome=s.status==='paid'?'Already settled — no additional payment':'Earlier approval expired — no payment sent';
   add('blocked','Earlier payment attempt blocked',`Attempted ${old.amount.toLocaleString('en-US')} Test USD under invoice version ${old.revision}. ${s.mode==='rehearsal'?'Local rehearsal guard':'Payment program'} rejected it. No Test USD moved.`,old.amount,'failed');
  } else if(a.type==='pay'){
   allow('executor');unpaid();if(s.status!=='approved'||new Set(s.approvals.filter(p=>p.current&&p.revision===s.revision&&p.amount===s.amountDue).map(p=>p.actor)).size!==2)throw new DomainError('APPROVALS_REQUIRED','Two distinct approvals for the current amount are required before payment.');
   s.status='paid';s.settlement={amount:s.amountDue,signature:null,at:now(),recipient:s.invoice.recipient,mode:s.mode};
   s.chain.vaultBalance=(s.chain.vaultBalance??0)-s.amountDue;s.chain.recipientBalance=(s.chain.recipientBalance??0)+s.amountDue;
   add('payment',`${s.amountDue.toLocaleString('en-US')} Test USD ${s.mode==='rehearsal'?'recorded in rehearsal':'paid'}`,s.mode==='rehearsal'?'Local rehearsal settlement only. No on-chain funds moved.':'Payment confirmed for the current approved amount.',s.amountDue);
  }
  if(this.effect){this.data.pendingIntent={action:structuredClone(a),before:structuredClone(before),intendedAfter:structuredClone(s),fingerprint,preparedAt:now()};this.data.state.operation={type:a.type,status:'pending',message:'Waiting for the test-network result.'};await this.save();try{const patch=await this.effect(a,before,s,p=>this.persistPrepared(p));Object.assign(s,patch);s.operation=null;}catch(e:any){this.data.state=before;if(e.code==='CONFIRMATION_UNKNOWN'){this.data.state.operation={type:a.type,status:'unknown',message:e.message};}else delete this.data.pendingIntent;await this.save();throw e;}}
  delete this.data.pendingIntent;this.data.state=s;this.data.idempotency[a.idempotencyKey]={fingerprint,scenarioId:s.scenarioId};await this.save();return this.getState();
 }
}

export async function validateApprovalIntent(intent:PendingIntent){
 const fail=()=>{throw new DomainError('RECOVERY_MISMATCH','The saved approval does not match its expected transition.');};
 const {action,before,intendedAfter:after}=intent;
 if(action.type!=='approve'||before.operation||after.operation||actionFingerprint(action)!==intent.fingerprint||before.scenarioId!==after.scenarioId)fail();
 const model=new Engine();await model.replaceState(before);let expected:State;try{expected=await model.act(action);}catch{fail();return;}
 const actualEvent=after.evidence.at(-1),expectedEvent=expected.evidence.at(-1);const actualApproval=after.approvals.at(-1),expectedApproval=expected.approvals.at(-1);
 if(!actualEvent||!expectedEvent||!actualApproval||!expectedApproval||before.evidence.some(e=>e.id===actualEvent.id))fail();
 const validTime=(value:string)=>Number.isFinite(Date.parse(value))&&Math.abs(Date.parse(value)-Date.parse(intent.preparedAt))<5000;
 if(!validTime(actualEvent!.at)||!validTime(actualApproval!.at)||!actualEvent!.id)fail();
 expectedEvent!.id=actualEvent!.id;expectedEvent!.at=actualEvent!.at;expectedApproval!.at=actualApproval!.at;
 if(!before.previousInstruction&&expected.previousInstruction&&after.previousInstruction){if(!validTime(after.previousInstruction.capturedAt))fail();expected.previousInstruction.capturedAt=after.previousInstruction.capturedAt;}
 if(!isDeepStrictEqual(expected,after))fail();
}
