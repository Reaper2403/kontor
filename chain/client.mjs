import { invoiceDocument, invoiceDocumentJSON, invoiceDocumentDigest } from './invoice.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { Connection, ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export const ERRORS = Object.freeze({7000:'Unauthorized',7001:'InvalidAccount',7002:'StaleRevision',7003:'AlreadyPaid',7004:'MissingApprovals',7005:'ApprovalExpired',7006:'InvalidAmount',7007:'DuplicateApproval',7008:'CreditAlreadyApplied',7009:'InvalidInstruction',7010:'AliasedAccount'});
export const digest = value => createHash('sha256').update(value).digest();
const pk = value => value instanceof PublicKey ? value : new PublicKey(value);
const u64 = value => { const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(value));return b; };
const i64 = value => { const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(value));return b; };
const hex = value => typeof value==='string' ? Buffer.from(value,'hex') : Buffer.from(value);
const hash32 = (value,fallback) => { const b=value===undefined?digest(fallback):hex(value);if(b.length!==32)throw new Error('Expected 32-byte digest');return b; };
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey:pk(pubkey),isWritable,isSigner});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function base58(bytes) { const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+Buffer.from(bytes).toString('hex'));let s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const b of bytes){if(b!==0)break;s='1'+s;}return s; }
function codeFor(error,logs=[]) {const found=logs.find(s=>/Kontor::(Unauthorized|InvalidAccount|StaleRevision|AlreadyPaid|MissingApprovals|ApprovalExpired|InvalidAmount|DuplicateApproval|CreditAlreadyApplied|InvalidInstruction|AliasedAccount)/.test(s));if(found)return found.match(/Kontor::(\w+)/)[1];const custom=error?.InstructionError?.[1]?.Custom;return ERRORS[custom]??'TransactionFailed';}
export class ChainError extends Error {constructor(code,message,extra={}){super(message);this.name='ChainError';this.code=code;Object.assign(this,extra);}}
function decoder(data,magic) {if(data.subarray(0,8).toString()!==magic)throw new ChainError('InvalidAccount','Wrong account discriminator');let at=8;return {key(){const v=new PublicKey(data.subarray(at,at+32)).toBase58();at+=32;return v;},hash(){const v=data.subarray(at,at+32).toString('hex');at+=32;return v;},u64(){const v=data.readBigUInt64LE(at);at+=8;return v;},i64(){const v=data.readBigInt64LE(at);at+=8;return v;},byte(){return data[at++];}};}
export function decodeObligation(data) {if(data.length!==129)throw new Error('Invalid obligation length');const d=decoder(data,'KNTROBL1');return {config:d.key(),id:d.u64().toString(),amountOriginal:d.u64().toString(),invoiceDigest:d.hash(),revision:Number(d.u64()),paid:!!d.byte(),vault:d.key()};}
export function decodeRevision(data) {if(data.length!==217)throw new Error('Invalid revision length');const d=decoder(data,'KNTRREV1');return {obligation:d.key(),revision:Number(d.u64()),amount:d.u64().toString(),credit:d.u64().toString(),evidenceDigest:d.hash(),creditDigest:d.hash(),reasonDigest:d.hash(),expiry:Number(d.i64()),approvalMask:d.byte(),approvedAt:[Number(d.i64()),Number(d.i64())],reviewer:d.key()};}

export function createClient({rpcUrl,programId,keys,mint,recipient,commitment='confirmed',onPrepared,onSubmitted}) {
  let transactionSequence=0;
  const connection=new Connection(rpcUrl,commitment),pid=pk(programId),mintKey=pk(mint),recipientKey=pk(recipient);
  for(const role of ['registrar','reviewer','approverA','approverB','executor'])if(!keys[role]?.secretKey)throw new Error(`Missing external key: ${role}`);
  if(keys.approverA.publicKey.equals(keys.approverB.publicKey))throw new Error('Approvers must be distinct');
  const config=PublicKey.findProgramAddressSync([Buffer.from('config'),keys.registrar.publicKey.toBuffer()],pid)[0];
  const addresses=(handle,revision=0)=>{const obligation=PublicKey.findProgramAddressSync([Buffer.from('obligation'),config.toBuffer(),u64(handle.id)],pid)[0];return {config,obligation,revision:PublicKey.findProgramAddressSync([Buffer.from('revision'),obligation.toBuffer(),u64(revision)],pid)[0],vault:PublicKey.findProgramAddressSync([Buffer.from('vault'),obligation.toBuffer()],pid)[0],mint:mintKey,recipient:recipientKey};};
  const instruction=(tag,data,accounts)=>new TransactionInstruction({programId:pid,keys:accounts,data:Buffer.concat([Buffer.from([tag]),...data])});
  async function rawRpc(method,params){const response=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(!response.ok)throw new Error(`RPC HTTP ${response.status}`);const body=await response.json();if(body.error)throw new Error(`RPC ${method}: ${body.error.message}`);return body.result;}
  async function signed(ix,signer){const latest=await connection.getLatestBlockhash(commitment);const tx=new Transaction({feePayer:signer.publicKey,...latest}).add(ComputeBudgetProgram.setComputeUnitLimit({units:200_000+(transactionSequence++%100_000)}),ix);tx.sign(signer);return {tx,...latest,signature:base58(tx.signature)};}
  async function record(signature){for(let n=0;n<12;n++){const result=await connection.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});if(result)return {signature,slot:result.slot,blockTime:result.blockTime,error:result.meta?.err??null,logs:result.meta?.logMessages??[],fee:result.meta?.fee,preTokenBalances:result.meta?.preTokenBalances??[],postTokenBalances:result.meta?.postTokenBalances??[]};await wait(300);}throw new ChainError('UnknownOutcome','Confirmed transaction details unavailable',{signature,confirmation:'unknown'});}
  async function broadcast(signedTx,{allowFailure=false,kind='transaction',handle=null}={}){
    const bytes=signedTx.tx.serialize();const signature=signedTx.signature;
    // Persist the known signature before sending, including when the RPC response is lost.
    const prepared={signature,blockhash:signedTx.blockhash,lastValidBlockHeight:signedTx.lastValidBlockHeight,transactionBase64:bytes.toString('base64'),kind,handle};
    await onPrepared?.(prepared);
    await onSubmitted?.(prepared);
    try {
      await connection.sendRawTransaction(bytes,{skipPreflight:true,maxRetries:2,preflightCommitment:commitment});
      await connection.confirmTransaction({signature,blockhash:signedTx.blockhash,lastValidBlockHeight:signedTx.lastValidBlockHeight},commitment);
    }catch(error){throw new ChainError('UnknownOutcome',`Submission/confirmation needs reconciliation: ${error.message}`,{signature,confirmation:'unknown'});}
    let evidence;try{evidence=await record(signature);}catch(error){if(error instanceof ChainError)throw error;throw new ChainError('UnknownOutcome',`Transaction record needs reconciliation: ${error.message}`,{signature,confirmation:'unknown'});}
    if(evidence.error&&!allowFailure)throw new ChainError(codeFor(evidence.error,evidence.logs),codeFor(evidence.error,evidence.logs),{signature,confirmation:'failed',evidence});
    return {signature,confirmation:evidence.error?'failed':'confirmed',evidence};
  }
  async function submit(ix,signer,options){return broadcast(await signed(ix,signer),options);}
  async function refresh(result,handle){try{return {...result,state:await read(handle)};}catch(error){throw new ChainError('StateRefreshFailed',`Transaction is ${result.confirmation}; state refresh failed: ${error.message}`,{signature:result.signature,confirmation:result.confirmation,evidence:result.evidence});}}
  async function read(handle){
    const a=addresses(handle),info=await connection.getAccountInfo(a.obligation,commitment);
    if(!info||!info.owner.equals(pid))throw new ChainError('InvalidAccount','Obligation not owned by this program');
    const o=decodeObligation(info.data);if(o.config!==config.toBase58()||o.id!==String(handle.id)||o.vault!==a.vault.toBase58())throw new ChainError('InvalidAccount','Noncanonical obligation');
    if(o.revision>1)throw new ChainError('InvalidAccount','Unsupported revision');
    const history=[];for(let index=0;index<=o.revision;index++){const ri=await connection.getAccountInfo(addresses(handle,index).revision,commitment);if(!ri||!ri.owner.equals(pid))throw new ChainError('InvalidAccount','Revision unavailable');const r=decodeRevision(ri.data);if(r.obligation!==a.obligation.toBase58()||r.revision!==index)throw new ChainError('InvalidAccount','Noncanonical revision');history.push(r);}
    const latest=history.at(-1);const configInfo=await connection.getAccountInfo(config,commitment);if(!configInfo||!configInfo.owner.equals(pid)||configInfo.data.length!==232)throw new ChainError('InvalidAccount','Configuration unavailable');const cd=decoder(configInfo.data,'KNTRCFG1');const registrar=cd.key(),reviewer=cd.key(),approverA=cd.key(),approverB=cd.key(),cm=cd.key(),cr=cd.key(),recipientOwner=cd.key();
    if(registrar!==keys.registrar.publicKey.toBase58()||reviewer!==keys.reviewer.publicKey.toBase58()||approverA!==keys.approverA.publicKey.toBase58()||approverB!==keys.approverB.publicKey.toBase58()||cm!==mintKey.toBase58()||cr!==recipientKey.toBase58())throw new ChainError('InvalidAccount','Configured roles or asset do not match adapter');
    return {...o,...(o.invoiceDigest===invoiceDocumentDigest?{invoiceDocument}:{}),credit:latest.credit,amountDue:latest.amount,evidenceDigest:latest.evidenceDigest,expiry:latest.expiry,approvalMask:latest.approvalMask,approvers:[{role:'approver-a',address:approverA,approved:!!(latest.approvalMask&1)},{role:'approver-b',address:approverB,approved:!!(latest.approvalMask&2)}],mint:cm,recipient:cr,recipientOwner,config:config.toBase58(),obligation:a.obligation.toBase58(),revisionAddress:addresses(handle,o.revision).revision.toBase58(),history};
  }
  async function createScenario({id=randomBytes(8).readBigUInt64LE().toString(),invoiceDigest,expiresInSeconds=3600}={}){
    const a=addresses({id});const configInfo=await connection.getAccountInfo(config,commitment);
    if(!configInfo)await submit(instruction(0,[keys.reviewer.publicKey.toBuffer(),keys.approverA.publicKey.toBuffer(),keys.approverB.publicKey.toBuffer()],[meta(keys.registrar.publicKey,true,true),meta(config,true),meta(mintKey),meta(recipientKey),meta(SystemProgram.programId)]),keys.registrar,{kind:'initialize-config',handle:{id:String(id)}});
    const expiry=Math.floor(Date.now()/1000)+expiresInSeconds;
    const created=await submit(instruction(1,[u64(id),u64(1000_000_000),hash32(invoiceDigest,invoiceDocumentJSON),i64(expiry)],[meta(keys.registrar.publicKey,true,true),meta(config),meta(a.obligation,true),meta(a.revision,true),meta(a.vault,true),meta(mintKey),meta(recipientKey),meta(SystemProgram.programId),meta(TOKEN_PROGRAM_ID)]),keys.registrar,{kind:'create-scenario',handle:{id:String(id)}});
    const handle={id:String(id),config:config.toBase58(),obligation:a.obligation.toBase58(),revisionAddress:a.revision.toBase58(),vault:a.vault.toBase58(),mint:mintKey.toBase58(),recipient:recipientKey.toBase58()};await refresh(created,handle);return handle;
  }
  function approveIx(handle,actor,expectedRevision){const a=addresses(handle,expectedRevision);return instruction(2,[u64(expectedRevision)],[meta(actor.publicKey,false,true),meta(config),meta(a.obligation,true),meta(a.revision,true)]);}
  async function approve(handle,{actor,expectedRevision}){const signer=actor==='approver-a'?keys.approverA:actor==='approver-b'?keys.approverB:null;if(!signer)throw new ChainError('Unauthorized','Unknown approver');const result=await submit(approveIx(handle,signer,expectedRevision),signer,{kind:'approve',handle});return refresh(result,handle);}
  function creditIx(handle,{expectedRevision,amount='200000000',creditDigest,reasonDigest,expiresInSeconds=3600},signer=keys.reviewer){const a=addresses(handle,expectedRevision);return instruction(3,[u64(expectedRevision),u64(amount),hash32(creditDigest,'Kontor synthetic credit CN-204: 200 Test USD'),hash32(reasonDigest,'Accepted service credit'),i64(Math.floor(Date.now()/1000)+expiresInSeconds)],[meta(signer.publicKey,true,true),meta(config),meta(a.obligation,true),meta(a.revision),meta(addresses(handle,expectedRevision+1).revision,true),meta(SystemProgram.programId)]);}
  async function applyCredit(handle,options){const result=await submit(creditIx(handle,options),keys.reviewer,{kind:'apply-credit',handle});return refresh(result,handle);}
  function executeIx(handle,expectedRevision,executor=keys.executor){const a=addresses(handle,expectedRevision);return instruction(4,[u64(expectedRevision)],[meta(executor.publicKey,false,true),meta(config),meta(a.obligation,true),meta(a.revision),meta(a.vault,true),meta(mintKey),meta(recipientKey,true),meta(TOKEN_PROGRAM_ID)]);}
  async function capturePrevious(handle){const state=await read(handle);const st=await signed(executeIx(handle,state.revision),keys.executor);const bytes=st.tx.serialize(),transactionBase64=bytes.toString('base64');const simulation=await rawRpc('simulateTransaction',[transactionBase64,{encoding:'base64',commitment,sigVerify:true}]);if(simulation.value.err)throw new ChainError(codeFor(simulation.value.err,simulation.value.logs),'Old instruction must simulate successfully before revision',{evidence:simulation.value});return {signature:st.signature,blockhash:st.blockhash,lastValidBlockHeight:st.lastValidBlockHeight,transactionBase64,sha256:digest(bytes).toString('hex'),revision:state.revision,amount:state.amountDue,expiry:state.expiry,simulation:simulation.value,capturedAt:new Date().toISOString()};}
  async function balances(handle){const a=addresses(handle);const [vault,recipient]=await Promise.all([connection.getTokenAccountBalance(a.vault,commitment),connection.getTokenAccountBalance(recipientKey,commitment)]);return {vault:vault.value.amount,recipient:recipient.value.amount};}
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
  return {connection,addresses,createScenario,read,approve,applyCredit,capturePrevious,testPrevious,pay,
    // Explicit low-level surface supports an independent adversarial test client; no UI checks are relied on.
    testing:{instruction,approveIx,creditIx,executeIx,submit,signed,broadcast,balances,record},programId:pid};
}
