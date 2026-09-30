// Records real devnet operations through the same service boundary as the UI.
// Requires a fresh, funded v2 scenario. Journals its capture in the private manifest; preserves old evidence.
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {devnetAdapter} from '../server/devnet.js';
import {Engine} from '../server/engine.js';
import type {Action} from '../contracts/api.js';
import {invoiceDocument,invoiceDocumentJSON,invoiceDocumentDigest} from '../chain/invoice.mjs';
const manifest=process.env.KONTOR_DEVNET_MANIFEST,output=process.env.KONTOR_EVIDENCE_PATH,stateFile=process.env.KONTOR_STATE_FILE;
if(!manifest||!output||!stateFile)throw Error('Set explicit excluded manifest, state and output paths');
try{await readFile(output);throw Error('Output already exists; preserve the earlier run');}catch(e:any){if(e.code!=='ENOENT')throw e;}
const adapter=await devnetAdapter(manifest);if(adapter.requiresExistingState)throw Error('Use a fresh scenario');
const engine=new Engine({file:stateFile,effect:adapter.effect,reconcile:adapter.reconcile});await engine.load();await engine.replaceState(await adapter.link(engine.getState()));
for(const [type,actor] of [['approve','approver-a'],['approve','approver-b'],['apply-credit','reviewer'],['test-previous','executor'],['approve','approver-a'],['approve','approver-b'],['pay','executor'],['release-remainder','executor']] as const){
 const a:Action={type,actor,expectedRevision:engine.getState().revision,idempotencyKey:randomUUID(),...(type==='apply-credit'?{amount:200,reference:'CN-204',reason:'Service adjustment agreed with supplier'}:{})};
 await engine.act(a);console.log(type+' confirmed');
}
const state=engine.getState();assert.equal(state.status,'paid');assert.equal(state.settlement?.amount,800);assert.equal(state.treasuryReturn?.amount,200);assert.equal(state.chain.vaultBalance,0);assert.ok(state.settlement?.signature);assert.ok(state.treasuryReturn?.signature);assert.notEqual(state.settlement?.signature,state.treasuryReturn?.signature);const hash=(s:string)=>createHash('sha256').update(s).digest('hex');const credit={reference:state.creditNote!.reference,amount:state.creditNote!.amount};
const record={title:'Kontor v2 demonstration evidence',protocolVersion:2,disclosure:'Solana devnet. Synthetic Test USD, no monetary value. Server-held demonstration role keys.',exportedAt:new Date().toISOString(),networkProofs:adapter.proofs().filter((p:any)=>p.scenarioId===state.scenarioId),committedDocuments:{invoice:{document:invoiceDocument,utf8:invoiceDocumentJSON,sha256:invoiceDocumentDigest},credit:{document:credit,utf8:JSON.stringify(credit),sha256:hash(JSON.stringify(credit)),reason:state.creditNote!.reason,reasonSha256:hash(state.creditNote!.reason)}},...state};
await writeFile(output,JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify({output,scenario:state.scenarioId,payment:state.settlement?.signature,treasuryReturn:state.treasuryReturn?.signature,vaultBalance:state.chain.vaultBalance}));
