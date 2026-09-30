import express from 'express';
import {invoiceDocument,invoiceDocumentJSON,invoiceDocumentDigest} from '../chain/invoice.mjs';
import {createHash} from 'node:crypto';
import {Engine,DomainError} from './engine.js';
import {devnetAdapter} from './devnet.js';
import {access} from 'node:fs/promises';
const app=express();app.use(express.json({limit:'12kb'}));
app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');const origin=req.get('origin');if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1):(5173|4310)$/.test(origin))return res.status(403).json({error:{code:'ORIGIN_DENIED',message:'This demonstration is available only from the local workspace.',retryable:false}});next();});
const adapter=process.env.KONTOR_DEVNET_MANIFEST?await devnetAdapter(process.env.KONTOR_DEVNET_MANIFEST):null;
const stateFile=process.env.KONTOR_STATE_FILE||(adapter?'.local/devnet-state.json':'.local/state.json');
if(adapter?.requiresExistingState){try{await access(stateFile);}catch{throw Error('A mutated chain scenario requires its existing evidence state. Do not invent a replacement history.');}}
const engine=new Engine({file:stateFile,effect:adapter?.effect});await engine.load();
if(adapter)await engine.replaceState(await adapter.link(engine.getState()));
app.get('/api/state',(_req,res)=>res.json(engine.getState()));
app.post('/api/actions',async(req,res)=>{try{res.json(await engine.act(req.body));}catch(e){const known=e instanceof DomainError;res.status(known?409:500).json({error:{code:known?e.code:'REQUEST_FAILED',message:known?e.message:'The action could not be completed. Refresh the payable and try again.',retryable:known?e.retryable:true},state:engine.getState()});if(!known)console.error('Action failure:',e instanceof Error?e.message:'unknown');}});
app.get('/api/evidence',(_req,res)=>{const s=engine.getState();res.setHeader('Content-Disposition',`attachment; filename="kontor-${s.invoice.number}-evidence.json"`);res.json({title:'Kontor demonstration evidence',disclosure:s.mode==='rehearsal'?'Local rehearsal only. No blockchain transactions or real funds.':'Solana devnet. Custom Test USD, no real value. Server-held demonstration role keys.',exportedAt:new Date().toISOString(),networkProofs:adapter?.proofs()??[],committedDocuments:adapter?{invoice:{document:invoiceDocument,utf8:invoiceDocumentJSON,sha256:invoiceDocumentDigest},credit:s.creditNote?{document:{reference:s.creditNote.reference,amount:s.creditNote.amount},utf8:JSON.stringify({reference:s.creditNote.reference,amount:s.creditNote.amount}),sha256:createHash('sha256').update(JSON.stringify({reference:s.creditNote.reference,amount:s.creditNote.amount})).digest('hex'),reason:s.creditNote.reason,reasonSha256:createHash('sha256').update(s.creditNote.reason).digest('hex')}:null}:null,...s});});
app.get('/api/health',(_req,res)=>res.json({ok:true,mode:engine.getState().mode}));
app.listen(4310,'127.0.0.1',()=>console.log('Kontor service on http://127.0.0.1:4310'));
