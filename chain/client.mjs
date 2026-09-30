import { invoiceDocument, invoiceDocumentJSON, invoiceDocumentDigest } from './invoice.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { Connection, ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export const ERRORS = Object.freeze({7000:'Unauthorized',7001:'InvalidAccount',7002:'StaleRevision',7003:'AlreadyPaid',7004:'MissingApprovals',7005:'ApprovalExpired',7006:'InvalidAmount',7007:'DuplicateApproval',7008:'CreditAlreadyApplied',7009:'InvalidInstruction',7010:'AliasedAccount',7011:'NotPaid'});
export const digest = value => createHash('sha256').update(value).digest();
const pk = value => value instanceof PublicKey ? value : new PublicKey(value);
const u64 = value => { const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(value));return b; };
const i64 = value => { const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(value));return b; };
const hex = value => typeof value==='string' ? Buffer.from(value,'hex') : Buffer.from(value);
const hash32 = (value,fallback) => { const b=value===undefined?digest(fallback):hex(value);if(b.length!==32)throw new Error('Expected 32-byte digest');return b; };
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey:pk(pubkey),isWritable,isSigner});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// All clients in this process share one HTTP queue per endpoint. This does not
// claim to coordinate unrelated processes sharing the public RPC's IP quota.
const endpointQueues=new Map();
const READ_ONLY_RPC_METHODS=new Set(['getAccountInfo','getMultipleAccounts','getLatestBlockhash','getTransaction','getTokenAccountBalance','getTokenAccountsByOwner','getSignatureStatuses','getBlockHeight','isBlockhashValid','getSlot','getBlockTime','getBalance','getGenesisHash','getHealth','getVersion','simulateTransaction']);
export function createPacedRpcFetch(endpoint,{fetchImpl=globalThis.fetch,minIntervalMs=350,readRetries=2,retryAfterCapMs=2000,requestTimeoutMs=15000,now=Date.now,sleep=wait}={}) {
  let queue=endpointQueues.get(endpoint);if(!queue){queue={tail:Promise.resolve(),nextStartAt:0};endpointQueues.set(endpoint,queue);}
  const attempt=(input,init)=>{
    const run=queue.tail.then(async()=>{
      const delay=Math.max(0,queue.nextStartAt-now());if(delay)await sleep(delay);
      queue.nextStartAt=now()+minIntervalMs;
      const controller=new AbortController();const upstreamSignal=init?.signal;
      const forwardAbort=()=>controller.abort(upstreamSignal.reason);
      if(upstreamSignal?.aborted)forwardAbort();else upstreamSignal?.addEventListener('abort',forwardAbort,{once:true});
      let timer;
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error('RPC HTTP request timed out');controller.abort(error);reject(error);},Math.min(15000,Math.max(1,requestTimeoutMs)));});
      const operation=(async()=>{const response=await fetchImpl(input,{...init,signal:controller.signal});
        // Bound response-body reads as well as header arrival; web3 consumes text later.
        const body=await response.arrayBuffer();return new Response(body.byteLength?body:null,{status:response.status,statusText:response.statusText,headers:response.headers});})();
      try{return await Promise.race([operation,timeout]);}finally{clearTimeout(timer);upstreamSignal?.removeEventListener('abort',forwardAbort);}
    });
    // Rejection must release the queue; it must never cause a hidden retry.
    queue.tail=run.then(()=>undefined,()=>undefined);return run;
  };
  return async(input,init)=>{
    let method;try{method=JSON.parse(typeof init?.body==='string'?init.body:'{}').method;}catch{}
    const retries=READ_ONLY_RPC_METHODS.has(method)?Math.min(2,Math.max(0,readRetries)):0;
    for(let index=0;;index++){
      const response=await attempt(input,init);
      if(response.status!==429||index>=retries)return response;
      const value=response.headers?.get('retry-after');let delay=500*2**index;
      if(value){const seconds=Number(value);const parsed=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now();if(Number.isFinite(parsed))delay=parsed;}
      delay=Math.max(0,Math.min(retryAfterCapMs,delay));
      // Release an intermediate error response before the next bounded read.
      try{await response.body?.cancel();}catch{}
      await sleep(delay);
    }
  };
}
function base58(bytes) { const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+Buffer.from(bytes).toString('hex'));let s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const b of bytes){if(b!==0)break;s='1'+s;}return s; }
function codeFor(error,logs=[]) {const found=logs.find(s=>/Kontor::(Unauthorized|InvalidAccount|StaleRevision|AlreadyPaid|MissingApprovals|ApprovalExpired|InvalidAmount|DuplicateApproval|CreditAlreadyApplied|InvalidInstruction|AliasedAccount|NotPaid)/.test(s));if(found)return found.match(/Kontor::(\w+)/)[1];const custom=error?.InstructionError?.[1]?.Custom;return ERRORS[custom]??'TransactionFailed';}
export class ChainError extends Error {constructor(code,message,extra={}){super(message);this.name='ChainError';this.code=code;Object.assign(this,extra);}}
// A failed-only fallback needs explicit structured failure metadata, not logs or exception hints.
// Only the explicit Custom-u32 shape needed by these program checks is accepted.
// Other variants and invented enum names remain unresolved.
function validFailureMetadata(value,instructionCount) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Object.hasOwn(value,'InstructionError'))return false;
  const pair=value.InstructionError;
  if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||pair[0]<0||pair[0]>=instructionCount)return false;
  const detail=pair[1];
  return Boolean(detail&&typeof detail==='object'&&!Array.isArray(detail)&&Object.keys(detail).length===1&&Object.hasOwn(detail,'Custom')&&Number.isInteger(detail.Custom)&&detail.Custom>=0&&detail.Custom<=0xffffffff);
}

function decoder(data,magic) {if(data.subarray(0,8).toString()!==magic)throw new ChainError('InvalidAccount','Wrong account discriminator');let at=8;return {key(){const v=new PublicKey(data.subarray(at,at+32)).toBase58();at+=32;return v;},hash(){const v=data.subarray(at,at+32).toString('hex');at+=32;return v;},u64(){const v=data.readBigUInt64LE(at);at+=8;return v;},i64(){const v=data.readBigInt64LE(at);at+=8;return v;},byte(){return data[at++];}};}
export function decodeObligation(data) {if(data.length!==193)throw new ChainError('InvalidAccount','Invalid v2 obligation length');const d=decoder(data,'KNTROBL2');return {config:d.key(),id:d.u64().toString(),amountOriginal:d.u64().toString(),invoiceDigest:d.hash(),revision:Number(d.u64()),paid:!!d.byte(),vault:d.key(),recipient:d.key(),recipientOwner:d.key()};}
export function decodeRevision(data) {if(data.length!==217)throw new Error('Invalid revision length');const d=decoder(data,'KNTRREV1');return {obligation:d.key(),revision:Number(d.u64()),amount:d.u64().toString(),credit:d.u64().toString(),evidenceDigest:d.hash(),creditDigest:d.hash(),reasonDigest:d.hash(),expiry:Number(d.i64()),approvalMask:d.byte(),approvedAt:[Number(d.i64()),Number(d.i64())],reviewer:d.key()};}

export function releasedAmount(evidence,programId) {
  const invalid=()=>new ChainError('ReleaseEvidenceMismatch','Confirmed release amount could not be established',{signature:evidence?.signature,confirmation:'confirmed',evidence});
  if(evidence?.error!==null||!Array.isArray(evidence.logs))throw invalid();
  const pid=pk(programId).toBase58(),stack=[],amounts=[];let calls=0,successes=0;
  for(const line of evidence.logs){
    let match=/^Program (\w+) invoke \[(\d+)\]$/.exec(line);
    if(match){if(Number(match[2])!==stack.length+1)throw invalid();stack.push(match[1]);if(stack.length===1&&match[1]===pid)calls++;continue;}
    match=/^Program (\w+) (success|failed:.*)$/.exec(line);
    if(match){if(stack.pop()!==match[1])throw invalid();if(stack.length===0&&match[1]===pid&&match[2]==='success')successes++;continue;}
    match=/^Program log: Kontor::RemainderReleased amount=(0|[1-9]\d*)$/.exec(line);
    if(match&&stack.length===1&&stack[0]===pid)amounts.push(match[1]);
  }
  if(stack.length||calls!==1||successes!==1||amounts.length!==1||BigInt(amounts[0])>18446744073709551615n)throw invalid();
  return amounts[0];
}

export function createClient({rpcUrl,programId,keys,mint,recipient,treasury,treasuryOwner=/** @type {string | PublicKey | undefined} */(undefined),commitment='confirmed',onPrepared,onSubmitted}) {
  let transactionSequence=0;
  const rpcFetch=createPacedRpcFetch(rpcUrl);
  const connection=new Connection(rpcUrl,{commitment,fetch:rpcFetch,disableRetryOnRateLimit:true}),pid=pk(programId),mintKey=pk(mint),recipientKey=pk(recipient),treasuryKey=pk(treasury);
  for(const role of ['registrar','reviewer','approverA','approverB','executor'])if(!keys[role]?.secretKey)throw new Error(`Missing external key: ${role}`);
  if(keys.approverA.publicKey.equals(keys.approverB.publicKey))throw new Error('Approvers must be distinct');
  const config=PublicKey.findProgramAddressSync([Buffer.from('config'),keys.registrar.publicKey.toBuffer()],pid)[0];
  const addresses=(handle,revision=0)=>{const obligation=PublicKey.findProgramAddressSync([Buffer.from('obligation'),config.toBuffer(),u64(handle.id)],pid)[0];return {config,obligation,revision:PublicKey.findProgramAddressSync([Buffer.from('revision'),obligation.toBuffer(),u64(revision)],pid)[0],vault:PublicKey.findProgramAddressSync([Buffer.from('vault'),obligation.toBuffer()],pid)[0],mint:mintKey,recipient:pk(handle.recipient??recipientKey),treasury:treasuryKey};};
  const instruction=(tag,data,accounts)=>new TransactionInstruction({programId:pid,keys:accounts,data:Buffer.concat([Buffer.from([tag]),...data])});
  async function rawRpc(method,params){const response=await rpcFetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(!response.ok)throw new Error(`RPC HTTP ${response.status}`);const body=await response.json();if(body.error)throw new Error(`RPC ${method}: ${body.error.message}`);return body.result;}
  async function signed(ix,signer){const latest=await connection.getLatestBlockhash(commitment);const tx=new Transaction({feePayer:signer.publicKey,...latest}).add(ComputeBudgetProgram.setComputeUnitLimit({units:200_000+(transactionSequence++%100_000)}),ix);tx.sign(signer);return {tx,...latest,signature:base58(tx.signature)};}
  async function record(signature){for(let n=0;n<12;n++){const result=await connection.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});if(result)return {signature,slot:result.slot,blockTime:result.blockTime,error:result.meta?.err??null,logs:result.meta?.logMessages??[],fee:result.meta?.fee,preTokenBalances:result.meta?.preTokenBalances??[],postTokenBalances:result.meta?.postTokenBalances??[]};await wait(300);}throw new ChainError('UnknownOutcome','Confirmed transaction details unavailable',{signature,confirmation:'unknown'});}
  async function broadcast(signedTx,{allowFailure=false,kind='transaction',handle=null}={}){
    const bytes=signedTx.tx.serialize();const signature=signedTx.signature;
    // Persist the known signature before sending, including when the RPC response is lost.
    const prepared={signature,sha256:digest(bytes).toString('hex'),blockhash:signedTx.blockhash,lastValidBlockHeight:signedTx.lastValidBlockHeight,transactionBase64:bytes.toString('base64'),kind,handle};
    await onPrepared?.(prepared);
    await onSubmitted?.(prepared);
    let evidence;
    try {
      await connection.sendRawTransaction(bytes,{skipPreflight:true,maxRetries:2,preflightCommitment:commitment});
      await connection.confirmTransaction({signature,blockhash:signedTx.blockhash,lastValidBlockHeight:signedTx.lastValidBlockHeight},commitment);
    }catch(error){
      // Read the exact already-sent identity once; never sign or submit a replacement.
      // Success inspection deliberately cannot recover an uncertain successful action here.
      try{await inspectPrepared(prepared);}catch(inspection){
        if(inspection instanceof ChainError&&inspection.code==='TransactionFailed'&&inspection.confirmation==='failed'&&inspection.signature===signature&&inspection.evidence?.signature===signature&&validFailureMetadata(inspection.evidence?.error,signedTx.tx.instructions.length))evidence=inspection.evidence;
      }
      if(!evidence){const detail=typeof error?.message==='string'&&error.message?error.message:'RPC submission or confirmation did not complete';throw new ChainError('UnknownOutcome',`Submission/confirmation needs reconciliation: ${detail}`,{signature,confirmation:'unknown'});}
    }
    if(!evidence)try{evidence=await record(signature);}catch(error){if(error instanceof ChainError)throw error;throw new ChainError('UnknownOutcome',`Transaction record needs reconciliation: ${error.message}`,{signature,confirmation:'unknown'});}
    if(evidence.error&&!allowFailure)throw new ChainError(codeFor(evidence.error,evidence.logs),codeFor(evidence.error,evidence.logs),{signature,confirmation:'failed',evidence});
    return {signature,confirmation:evidence.error?'failed':'confirmed',evidence};
  }
  async function submit(ix,signer,options){return broadcast(await signed(ix,signer),options);}
  async function refresh(result,handle){try{return {...result,state:await read(handle,{minContextSlot:result.evidence?.slot})};}catch(error){throw new ChainError('StateRefreshFailed',`Transaction is ${result.confirmation}; state refresh failed: ${error.message}`,{signature:result.signature,confirmation:result.confirmation,evidence:result.evidence});}}
  async function read(handle,{minContextSlot}={}){
    const readConfig=minContextSlot===undefined?commitment:{commitment,minContextSlot};
    const a=addresses(handle),info=await connection.getAccountInfo(a.obligation,readConfig);
    if(!info||!info.owner.equals(pid))throw new ChainError('InvalidAccount','Obligation not owned by this program');
    const o=decodeObligation(info.data);if(o.config!==config.toBase58()||o.id!==String(handle.id)||o.vault!==a.vault.toBase58()||(handle.recipient!==undefined&&o.recipient!==pk(handle.recipient).toBase58()))throw new ChainError('InvalidAccount','Noncanonical obligation');
    if(o.revision>1)throw new ChainError('InvalidAccount','Unsupported revision');
    const history=[];for(let index=0;index<=o.revision;index++){const ri=await connection.getAccountInfo(addresses(handle,index).revision,readConfig);if(!ri||!ri.owner.equals(pid))throw new ChainError('InvalidAccount','Revision unavailable');const r=decodeRevision(ri.data);if(r.obligation!==a.obligation.toBase58()||r.revision!==index)throw new ChainError('InvalidAccount','Noncanonical revision');history.push(r);}
    const latest=history.at(-1);const configInfo=await connection.getAccountInfo(config,readConfig);if(!configInfo||!configInfo.owner.equals(pid)||configInfo.data.length!==232)throw new ChainError('InvalidAccount','Configuration unavailable');const cd=decoder(configInfo.data,'KNTRCFG2');const registrar=cd.key(),reviewer=cd.key(),approverA=cd.key(),approverB=cd.key(),cm=cd.key(),ct=cd.key(),cto=cd.key();
    if(registrar!==keys.registrar.publicKey.toBase58()||reviewer!==keys.reviewer.publicKey.toBase58()||approverA!==keys.approverA.publicKey.toBase58()||approverB!==keys.approverB.publicKey.toBase58()||cm!==mintKey.toBase58()||ct!==treasuryKey.toBase58()||(treasuryOwner!==undefined&&cto!==pk(treasuryOwner).toBase58()))throw new ChainError('InvalidAccount','Configured roles or asset do not match adapter');
    return {...o,...(o.invoiceDigest===invoiceDocumentDigest?{invoiceDocument}:{}),credit:latest.credit,amountDue:latest.amount,evidenceDigest:latest.evidenceDigest,expiry:latest.expiry,approvalMask:latest.approvalMask,approvers:[{role:'approver-a',address:approverA,approved:!!(latest.approvalMask&1)},{role:'approver-b',address:approverB,approved:!!(latest.approvalMask&2)}],mint:cm,recipient:o.recipient,recipientOwner:o.recipientOwner,treasury:ct,treasuryOwner:cto,config:config.toBase58(),obligation:a.obligation.toBase58(),revisionAddress:addresses(handle,o.revision).revision.toBase58(),history};
  }
  async function createScenario({id=randomBytes(8).readBigUInt64LE().toString(),recipient=recipientKey,invoiceDigest,expiresInSeconds=3600}={}){
    const a=addresses({id,recipient});const configInfo=await connection.getAccountInfo(config,commitment);
    if(!configInfo)await submit(instruction(0,[keys.reviewer.publicKey.toBuffer(),keys.approverA.publicKey.toBuffer(),keys.approverB.publicKey.toBuffer()],[meta(keys.registrar.publicKey,true,true),meta(config,true),meta(mintKey),meta(treasuryKey),meta(SystemProgram.programId)]),keys.registrar,{kind:'initialize-config',handle:{id:String(id)}});
    const expiry=Math.floor(Date.now()/1000)+expiresInSeconds;
    const created=await submit(createScenarioIx({id,recipient,invoiceDigest,expiry}),keys.registrar,{kind:'create-scenario',handle:{id:String(id),recipient:a.recipient.toBase58()}});
    const handle={id:String(id),config:config.toBase58(),obligation:a.obligation.toBase58(),revisionAddress:a.revision.toBase58(),vault:a.vault.toBase58(),mint:mintKey.toBase58(),recipient:a.recipient.toBase58()};await refresh(created,handle);return handle;
  }
  function createScenarioIx({id,recipient=recipientKey,invoiceDigest,expiry=Math.floor(Date.now()/1000)+3600}){const a=addresses({id,recipient});return instruction(1,[u64(id),u64(1000_000_000),hash32(invoiceDigest,invoiceDocumentJSON),i64(expiry)],[meta(keys.registrar.publicKey,true,true),meta(config),meta(a.obligation,true),meta(a.revision,true),meta(a.vault,true),meta(mintKey),meta(a.recipient),meta(SystemProgram.programId),meta(TOKEN_PROGRAM_ID)]);}
  function approveIx(handle,actor,expectedRevision){const a=addresses(handle,expectedRevision);return instruction(2,[u64(expectedRevision)],[meta(actor.publicKey,false,true),meta(config),meta(a.obligation,true),meta(a.revision,true)]);}
  async function approve(handle,{actor,expectedRevision}){const signer=actor==='approver-a'?keys.approverA:actor==='approver-b'?keys.approverB:null;if(!signer)throw new ChainError('Unauthorized','Unknown approver');const result=await submit(approveIx(handle,signer,expectedRevision),signer,{kind:'approve',handle});return refresh(result,handle);}
  function creditIx(handle,{expectedRevision,amount='200000000',creditDigest,reasonDigest,expiresInSeconds=3600},signer=keys.reviewer){const a=addresses(handle,expectedRevision);return instruction(3,[u64(expectedRevision),u64(amount),hash32(creditDigest,'Kontor synthetic credit CN-204: 200 Test USD'),hash32(reasonDigest,'Accepted service credit'),i64(Math.floor(Date.now()/1000)+expiresInSeconds)],[meta(signer.publicKey,true,true),meta(config),meta(a.obligation,true),meta(a.revision),meta(addresses(handle,expectedRevision+1).revision,true),meta(SystemProgram.programId)]);}
  async function applyCredit(handle,options){const result=await submit(creditIx(handle,options),keys.reviewer,{kind:'apply-credit',handle});return refresh(result,handle);}
  function executeIx(handle,expectedRevision,executor=keys.executor){const a=addresses(handle,expectedRevision);return instruction(4,[u64(expectedRevision)],[meta(executor.publicKey,false,true),meta(config),meta(a.obligation,true),meta(a.revision),meta(a.vault,true),meta(mintKey),meta(a.recipient,true),meta(TOKEN_PROGRAM_ID)]);}
  async function capturePrevious(handle){const state=await read(handle);const st=await signed(executeIx(handle,state.revision),keys.executor);const bytes=st.tx.serialize(),transactionBase64=bytes.toString('base64');const simulation=await rawRpc('simulateTransaction',[transactionBase64,{encoding:'base64',commitment,sigVerify:true}]);if(simulation.value.err)throw new ChainError(codeFor(simulation.value.err,simulation.value.logs),'Old instruction must simulate successfully before revision',{evidence:simulation.value});return {signature:st.signature,blockhash:st.blockhash,lastValidBlockHeight:st.lastValidBlockHeight,transactionBase64,sha256:digest(bytes).toString('hex'),revision:state.revision,amount:state.amountDue,expiry:state.expiry,simulation:simulation.value,capturedAt:new Date().toISOString()};}
  async function balances(handle){const a=addresses(handle);const [vault,recipient]=await Promise.all([connection.getTokenAccountBalance(a.vault,commitment),connection.getTokenAccountBalance(a.recipient,commitment)]);return {vault:vault.value.amount,recipient:recipient.value.amount};}
  async function testPrevious(handle,capture){
    const beforeState=await read(handle);if(beforeState.revision===capture.revision)throw new ChainError('NoRevisionChange','Apply and confirm the credit first');
    const bytes=Buffer.from(capture.transactionBase64,'base64');if(digest(bytes).toString('hex')!==capture.sha256)throw new ChainError('CaptureChanged','Captured instruction bytes changed');
    const valid=await connection.isBlockhashValid(capture.blockhash,{commitment});if(!valid.value)throw new ChainError('CaptureExpired','Captured blockhash expired; rehearse a new scenario');
    const slot=await connection.getSlot(commitment),blockTime=await connection.getBlockTime(slot);if((blockTime??Math.floor(Date.now()/1000))>=capture.expiry)throw new ChainError('ApprovalExpired','Captured approval expired');
    const before=await balances(handle);const tx=Transaction.from(bytes);if(!tx.serialize().equals(bytes))throw new ChainError('CaptureChanged','Re-serialized transaction differs from captured bytes');if(base58(tx.signature)!==capture.signature||tx.recentBlockhash!==capture.blockhash||!tx.verifySignatures())throw new ChainError('CaptureChanged','Captured signature/blockhash invalid');
    const result=await broadcast({tx,signature:capture.signature,blockhash:capture.blockhash,lastValidBlockHeight:capture.lastValidBlockHeight},{allowFailure:true,kind:'test-previous',handle});
    const after=await balances(handle).catch(error=>{throw new ChainError('StateRefreshFailed',error.message,{signature:result.signature,confirmation:result.confirmation,evidence:result.evidence});}),code=codeFor(result.evidence.error,result.evidence.logs);
    if(result.confirmation!=='failed'||code!=='StaleRevision')throw new ChainError('UnexpectedResult','The transaction did not prove a stale revision rejection',{...result,before,after});
    if(before.vault!==after.vault||before.recipient!==after.recipient)throw new ChainError('UnexpectedMovement','Token balances changed during stale proof',{...result,before,after});
    return {...result,error:{code,message:'Earlier approvals no longer authorize this revised payable'},state:(await refresh(result,handle)).state,evidence:{...result.evidence,unchangedBytesSha256:capture.sha256,blockhashValidBeforeSend:true,approvalExpiry:capture.expiry,checkedBlockTime:blockTime,before,after,tokenMovement:'0',simulationBeforeRevision:capture.simulation}};
  }
  async function pay(handle,{expectedRevision}){const result=await submit(executeIx(handle,expectedRevision),keys.executor,{kind:'pay',handle});return refresh(result,handle);}
  function releaseRemainderIx(handle,executor=keys.executor){const a=addresses(handle);return instruction(5,[],[meta(executor.publicKey,false,true),meta(config),meta(a.obligation),meta(a.vault,true),meta(mintKey),meta(treasuryKey,true),meta(TOKEN_PROGRAM_ID)]);}
  async function releaseRemainder(handle){
    const result=await submit(releaseRemainderIx(handle),keys.executor,{kind:'release-remainder',handle});
    const amountReleased=releasedAmount(result.evidence,pid);
    return refresh({...result,amountReleased},handle);
  }
  async function releaseBalances(handle){const a=addresses(handle);const [vault,recipient,treasury]=await Promise.all([connection.getTokenAccountBalance(a.vault,commitment),connection.getTokenAccountBalance(a.recipient,commitment),connection.getTokenAccountBalance(treasuryKey,commitment)]);return {vault:vault.value.amount,recipient:recipient.value.amount,treasury:treasury.value.amount};}
  // Read-only identity inspection. Business/action matching is the adapter's responsibility.
  async function inspectPrepared(prepared){
    const invalid=message=>new ChainError('PreparedIdentityMismatch',message,{signature:prepared?.signature,confirmation:'unknown'});
    if(!prepared||typeof prepared.transactionBase64!=='string'||typeof prepared.signature!=='string'||!/^([0-9a-f]{64})$/.test(prepared.sha256??''))throw invalid('Complete durable transaction identity is required');
    let bytes,tx;try{bytes=Buffer.from(prepared.transactionBase64,'base64');tx=Transaction.from(bytes);}catch{throw invalid('Saved transaction cannot be decoded');}
    let agrees=false;try{agrees=bytes.toString('base64')===prepared.transactionBase64&&digest(bytes).toString('hex')===prepared.sha256&&tx.serialize().equals(bytes)&&tx.verifySignatures()&&base58(tx.signature)===prepared.signature&&tx.recentBlockhash===prepared.blockhash;}catch{}
    if(!agrees)throw invalid('Saved bytes, hash, signatures or blockhash do not agree');
    let record;try{record=await rawRpc('getTransaction',[prepared.signature,{encoding:'base64',commitment:'confirmed',maxSupportedTransactionVersion:0}]);}catch(error){throw new ChainError('InspectionUnavailable',`Read-only transaction inspection failed: ${error.message}`,{signature:prepared.signature,confirmation:'unknown'});}
    if(!record)throw new ChainError('ConfirmationUnavailable','The transaction is not available as confirmed',{signature:prepared.signature,confirmation:'unknown'});
    if(!Array.isArray(record.transaction)||record.transaction.length!==2||record.transaction[1]!=='base64'||typeof record.transaction[0]!=='string'||!Buffer.from(record.transaction[0],'base64').equals(bytes))throw invalid('Confirmed transaction bytes differ from the durable identity');
    if(!Number.isSafeInteger(record.slot)||record.slot<0||!record.meta||!Object.hasOwn(record.meta,'err'))throw new ChainError('ConfirmationUnavailable','Confirmed slot or transaction metadata is unavailable',{signature:prepared.signature,confirmation:'unknown'});
    const evidence={signature:prepared.signature,slot:record.slot,blockTime:record.blockTime??null,error:record.meta.err,logs:record.meta.logMessages??[],fee:record.meta.fee,preTokenBalances:record.meta.preTokenBalances??[],postTokenBalances:record.meta.postTokenBalances??[]};
    if(record.meta.err!==null)throw new ChainError('TransactionFailed','The recorded transaction did not succeed',{signature:prepared.signature,confirmation:'failed',evidence});
    return {evidence,transactionBase64:bytes.toString('base64')};
  }
  return {connection,addresses,createScenario,read,inspectPrepared,approve,applyCredit,capturePrevious,testPrevious,pay,releaseRemainder,
    // Explicit low-level surface supports an independent adversarial test client; no UI checks are relied on.
    testing:{instruction,createScenarioIx,approveIx,creditIx,executeIx,releaseRemainderIx,submit,signed,broadcast,balances,releaseBalances,record},programId:pid};
}
