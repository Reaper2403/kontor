import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {Keypair,Transaction,TransactionInstruction,ComputeBudgetProgram,SystemProgram} from '@solana/web3.js';
import {createClient} from '../chain/client.mjs';
import {Engine,initialState,actionFingerprint,type PendingIntent} from '../server/engine.js';
import {verifyApprovalMessage,validateApprovalIntent} from '../server/recovery.js';

function u64(value:number){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(value));return b;}
function base58(bytes:Buffer){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+bytes.toString('hex')),s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const byte of bytes){if(byte)break;s='1'+s;}return s;}
async function fixture(){
 const keys:any=Object.fromEntries(['registrar','reviewer','approverA','approverB','executor'].map(role=>[role,Keypair.generate()]));
 const programId=Keypair.generate().publicKey,mint=Keypair.generate().publicKey,recipient=Keypair.generate().publicKey;
 const client=createClient({treasury:Keypair.generate().publicKey,rpcUrl:'http://127.0.0.1:1',programId,keys,mint,recipient,onPrepared:undefined,onSubmitted:undefined});
 const a=client.addresses({id:'42'},0),handle={id:'42',config:String(a.config),obligation:String(a.obligation),revisionAddress:String(a.revision),vault:String(a.vault),mint:String(mint),recipient:String(recipient)};
 const before=initialState();before.mode='devnet';before.asset={symbol:'Test USD',decimals:6,mint:String(mint),cluster:'devnet'};before.invoice.recipient=String(recipient);before.revision=2;before.credit=200;before.amountDue=800;before.creditNote={reference:'CN-REC',reason:'Service credit',amount:200,at:new Date().toISOString()};before.chain={programId:String(programId),obligation:handle.obligation,vault:handle.vault,recipientBalance:0,vaultBalance:1000};
 const action={type:'approve' as const,actor:'approver-a' as const,expectedRevision:2,idempotencyKey:'recovery-exact-fixture'};
 const model=new Engine();await model.replaceState(before);const after=await model.act(action);
 const intent:PendingIntent={action,before,intendedAfter:after,fingerprint:actionFingerprint(action),preparedAt:after.approvals.at(-1)!.at};
 const rev=client.addresses(handle,1).revision;
 const ix=new TransactionInstruction({programId,keys:[{pubkey:keys.approverA.publicKey,isSigner:true,isWritable:false},{pubkey:a.config,isSigner:false,isWritable:false},{pubkey:a.obligation,isSigner:false,isWritable:true},{pubkey:rev,isSigner:false,isWritable:true}],data:Buffer.concat([Buffer.from([2]),u64(1)])});
 const blockhash=Keypair.generate().publicKey.toBase58();
 function sign(instructions=[ComputeBudgetProgram.setComputeUnitLimit({units:200003}),ix],signer=keys.approverA){
  const tx=new Transaction({feePayer:signer.publicKey,recentBlockhash:blockhash}).add(...instructions);tx.sign(signer);const bytes=tx.serialize();
  intent.prepared={signature:base58(tx.signature!),transactionBase64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),blockhash,lastValidBlockHeight:900,kind:'approve',handle:structuredClone(handle)};
 }
 sign();return{client,keys,handle,intent,ix,sign,programId};
}

test('independently constructed exact approval message survives fee-payer privilege normalization',async()=>{
 const f=await fixture();await validateApprovalIntent(f.intent);assert.equal(verifyApprovalMessage(f.intent,f.client,f.keys,f.handle).actor,'approver-a');
});

for(const mutation of ['actor','action','revision','scenario-account','prepared-kind','handle-recipient','intent-fingerprint'] as const)test(`saved ${mutation} mismatch cannot establish approval authority`,async()=>{
 const f=await fixture();
 if(mutation==='actor')f.intent.action.actor='approver-b';
 if(mutation==='action')f.intent.action.type='pay';
 if(mutation==='revision')f.intent.action.expectedRevision=1;
 if(mutation==='scenario-account')f.intent.before.chain.obligation=Keypair.generate().publicKey.toBase58();
 if(mutation==='prepared-kind')f.intent.prepared!.kind='pay';
 if(mutation==='handle-recipient')f.intent.prepared!.handle.recipient=Keypair.generate().publicKey.toBase58();
 if(mutation==='intent-fingerprint')f.intent.fingerprint='0'.repeat(64);
 await assert.rejects(async()=>{await validateApprovalIntent(f.intent);verifyApprovalMessage(f.intent,f.client,f.keys,f.handle);});
});

for(const mutation of ['wrong-program','wrong-tag','wrong-revision','wrong-obligation','wrong-revision-account','extra-account','extra-transfer','second-approval','wrong-compute','wrong-fee-payer'] as const)test(`signed ${mutation} message is rejected`,async()=>{
 const f=await fixture();const compute=ComputeBudgetProgram.setComputeUnitLimit({units:200003});
 if(mutation==='wrong-program')f.ix.programId=Keypair.generate().publicKey;
 if(mutation==='wrong-tag')f.ix.data[0]=4;
 if(mutation==='wrong-revision')f.ix.data=Buffer.concat([Buffer.from([2]),u64(0)]);
 if(mutation==='wrong-obligation')f.ix.keys[2].pubkey=Keypair.generate().publicKey;
 if(mutation==='wrong-revision-account')f.ix.keys[3].pubkey=Keypair.generate().publicKey;
 if(mutation==='extra-account')f.ix.keys.push({pubkey:Keypair.generate().publicKey,isWritable:false,isSigner:false});
 if(mutation==='extra-transfer')f.sign([compute,f.ix,SystemProgram.transfer({fromPubkey:f.keys.approverA.publicKey,toPubkey:f.keys.executor.publicKey,lamports:1})]);
 else if(mutation==='second-approval')f.sign([compute,f.ix,f.ix]);
 else if(mutation==='wrong-compute')f.sign([ComputeBudgetProgram.setComputeUnitPrice({microLamports:1}),f.ix]);
 else if(mutation==='wrong-fee-payer'){f.ix.keys[0].pubkey=f.keys.approverB.publicKey;f.sign([compute,f.ix],f.keys.approverB);}
 else f.sign([compute,f.ix]);
 assert.throws(()=>verifyApprovalMessage(f.intent,f.client,f.keys,f.handle));
});

for(const mutation of ['history','settlement','second-actor','amount','recipient','extra-event','event-id-reuse','event-time','approval-time'] as const)test(`illegal intendedAfter ${mutation} cannot be promoted`,async()=>{
 const f=await fixture(),s=f.intent.intendedAfter;
 if(mutation==='history')s.evidence[0].detail='rewritten past event';
 if(mutation==='settlement')s.settlement={amount:800,signature:'invented',at:new Date().toISOString(),recipient:s.invoice.recipient,mode:'devnet'};
 if(mutation==='second-actor')s.approvals.push({...s.approvals[0],actor:'approver-b'});
 if(mutation==='amount')s.amountDue=700;
 if(mutation==='recipient')s.invoice.recipient=Keypair.generate().publicKey.toBase58();
 if(mutation==='extra-event')s.evidence.push({...s.evidence.at(-1)!,id:'extra'});
 if(mutation==='event-id-reuse')s.evidence.at(-1)!.id=s.evidence[0].id;
 if(mutation==='event-time')s.evidence.at(-1)!.at='2000-01-01T00:00:00.000Z';
 if(mutation==='approval-time')s.approvals.at(-1)!.at='2000-01-01T00:00:00.000Z';
 await assert.rejects(validateApprovalIntent(f.intent));
});
