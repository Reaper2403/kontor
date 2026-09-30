// Read-only chain reconciliation. Does not submit transactions or clear the service's pending guard.
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Keypair } from '@solana/web3.js';
import { createClient } from '../chain/client.mjs';
const manifestPath=process.env.KONTOR_MANIFEST_PATH??process.env.KONTOR_DEVNET_MANIFEST;if(!manifestPath)throw new Error('Set KONTOR_MANIFEST_PATH');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const directory=manifest.keyDir??process.env.KONTOR_KEY_DIR;if(!directory)throw new Error('Manifest keyDir or KONTOR_KEY_DIR required; no keys will be generated');
const keys={};for(const role of ['registrar','reviewer','approverA','approverB','executor'])keys[role]=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(join(directory,`${role}.json`),'utf8'))));
const client=createClient({...manifest,keys}),handle=manifest.handle??manifest.scenario,state=await client.read(handle),balances=await client.testing.balances(handle);
let files=[];const journalDirectory=join(dirname(manifestPath),'journal');try{files=(await readdir(journalDirectory)).filter(f=>f.endsWith('.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
const journal=[];for(const file of files.slice(-30)){const entry=JSON.parse(await readFile(join(journalDirectory,file),'utf8'));const statuses=await client.connection.getSignatureStatuses([entry.signature],{searchTransactionHistory:true});const status=statuses.value[0];let evidence=null;if(status?.confirmationStatus==='confirmed'||status?.confirmationStatus==='finalized')evidence=await client.testing.record(entry.signature);const currentHeight=await client.connection.getBlockHeight('confirmed');journal.push({signature:entry.signature,kind:entry.kind,handle:entry.handle,previousStatus:entry.status,chainStatus:status,expired:currentHeight>entry.lastValidBlockHeight,evidence});}
console.log(JSON.stringify({readOnly:true,submissionPerformed:false,programId:manifest.programId,obligation:handle.obligation,asset:'Test USD',state,balances,journal,instruction:'Retain this output with the original journal. A controller must reconcile the evidence and service state before explicitly clearing its unknown-operation guard. Do not send a replacement transaction merely because an RPC status is absent.'},null,2));
