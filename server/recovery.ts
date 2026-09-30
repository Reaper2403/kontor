import {Transaction,ComputeBudgetProgram} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {DomainError,type PendingIntent} from './engine.js';
export {validateApprovalIntent} from './engine.js';
export function verifyApprovalMessage(intent:PendingIntent,client:any,keys:any,handle:any){
 const reject=()=>{throw new DomainError('RECOVERY_MISMATCH','The transaction does not match the saved approval. The payable remains locked.');};
 const p=intent.prepared,a=intent.action,b=intent.before;
 if(!p||a.type!=='approve'||p.kind!=='approve'||!p.handle||String(p.handle.id)!==String(handle.id)||p.handle.obligation!==handle.obligation||b.chain.obligation!==handle.obligation||a.expectedRevision!==b.revision)reject();
 const signer=a.actor==='approver-a'?keys.approverA:a.actor==='approver-b'?keys.approverB:null;if(!signer)reject();
 const canonical=client.addresses(handle,0);
 for(const [field,key]of Object.entries({config:canonical.config,obligation:canonical.obligation,vault:canonical.vault,mint:canonical.mint,recipient:canonical.recipient,revisionAddress:canonical.revision}))if(handle[field]!==String(key)||p!.handle[field]!==String(key))reject();
 const bytes=Buffer.from(p!.transactionBase64,'base64');if(createHash('sha256').update(bytes).digest('hex')!==p!.sha256)reject();
 const tx=Transaction.from(bytes);
 if(!tx.verifySignatures()||!tx.feePayer?.equals(signer.publicKey)||tx.recentBlockhash!==p!.blockhash||tx.instructions.length!==2||tx.signatures.length!==1)reject();
 const compute=tx.instructions[0];
 if(!compute.programId.equals(ComputeBudgetProgram.programId)||compute.keys.length||compute.data.length!==5||compute.data[0]!==2)reject();
 const units=compute.data.readUInt32LE(1);if(units<200000||units>=300000)reject();
 const expected=new Transaction({feePayer:signer.publicKey,recentBlockhash:p!.blockhash}).add(ComputeBudgetProgram.setComputeUnitLimit({units}),client.testing.approveIx(handle,signer,a.expectedRevision-1));
 if(!expected.serializeMessage().equals(tx.serializeMessage()))reject();
 return {actor:a.actor,revision:a.expectedRevision-1,signature:p!.signature};
}
