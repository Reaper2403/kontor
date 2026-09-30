import assert from 'node:assert/strict';
import {Keypair,PublicKey} from '@solana/web3.js';
import {getOrCreateAssociatedTokenAccount} from '@solana/spl-token';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createClient } from '../chain/client.mjs';
import { loadOrCreateKeys,fundScenario } from '../chain/bootstrap.mjs';
const manifestPath=process.env.KONTOR_MANIFEST_PATH,directory=process.env.KONTOR_KEY_DIR;
if(!manifestPath||!directory)throw new Error('Set KONTOR_MANIFEST_PATH and excluded KONTOR_KEY_DIR');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
if(manifest.rpcUrl!=='https://api.devnet.solana.com'&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(manifest.rpcUrl))throw new Error('Test networks only');
const keys=await loadOrCreateKeys(directory),journalPath=`${directory}/proof-inflight.json`;
const client=createClient({...manifest,keys,onPrepared:async prepared=>writeFile(journalPath,JSON.stringify(prepared),{mode:0o600})});
async function approveBoth(handle,expectedRevision){await client.approve(handle,{actor:'approver-a',expectedRevision});await client.approve(handle,{actor:'approver-b',expectedRevision});}
const scenario=await client.createScenario();await fundScenario({client,handle:scenario,keys});await approveBoth(scenario,0);
const capture=await client.capturePrevious(scenario),requestPath=`${directory}/proof-replay.json`;
await writeFile(requestPath,JSON.stringify({...manifest,scenario,capture}));
const credit=await client.applyCredit(scenario,{expectedRevision:0});
const replay=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./chain-replay.mjs',import.meta.url)),requestPath],{env:{...process.env,KONTOR_KEY_DIR:directory},maxBuffer:2_000_000});
const blocked=JSON.parse(replay.stdout);assert.equal(blocked.error.code,'StaleRevision');assert.equal(blocked.evidence.tokenMovement,'0');
await approveBoth(scenario,1);const before=await client.testing.balances(scenario),paid=await client.pay(scenario,{expectedRevision:1}),after=await client.testing.balances(scenario);
assert.equal(BigInt(before.vault)-BigInt(after.vault),800000000n);assert.equal(BigInt(after.recipient)-BigInt(before.recipient),800000000n);
let duplicate;try{await client.pay(scenario,{expectedRevision:1});throw new Error('Duplicate executed');}catch(error){assert.equal(error.code,'AlreadyPaid');assert.equal(error.confirmation,'failed');duplicate={signature:error.signature,evidence:error.evidence};}
const releaseBefore=await client.testing.releaseBalances(scenario);
const released=await client.releaseRemainder(scenario),releaseAfter=await client.testing.releaseBalances(scenario);
assert.equal(released.amountReleased,'200000000');assert.equal(releaseAfter.vault,'0');assert.equal(BigInt(releaseAfter.treasury)-BigInt(releaseBefore.treasury),200000000n);assert.equal(releaseAfter.recipient,releaseBefore.recipient);
const secondOwner=Keypair.generate();const secondRecipient=await getOrCreateAssociatedTokenAccount(client.connection,keys.registrar,new PublicKey(manifest.mint),secondOwner.publicKey);
const executionFirst=await client.createScenario({recipient:secondRecipient.address});assert.equal(executionFirst.config,scenario.config);assert.notEqual(executionFirst.recipient,scenario.recipient);await fundScenario({client,handle:executionFirst,keys});await approveBoth(executionFirst,0);const secondBefore=await client.testing.balances(executionFirst);const firstPayment=await client.pay(executionFirst,{expectedRevision:0});const secondAfter=await client.testing.balances(executionFirst);assert.equal(BigInt(secondAfter.recipient)-BigInt(secondBefore.recipient),1000000000n);assert.equal((await client.testing.balances(scenario)).recipient,releaseAfter.recipient);
let lateCredit;try{await client.applyCredit(executionFirst,{expectedRevision:0});throw new Error('Paid obligation reopened');}catch(error){assert.equal(error.code,'AlreadyPaid');assert.equal(error.confirmation,'failed');lateCredit={signature:error.signature,evidence:error.evidence};}
const finalState=await client.read(executionFirst);assert.equal(finalState.paid,true);assert.equal(finalState.revision,0);
const evidence={kind:'on-chain-ordering-proof',protocolVersion:2,cluster:manifest.rpcUrl.includes('devnet')?'devnet':'localnet',asset:'Test USD',programId:manifest.programId,mint:manifest.mint,recipient:manifest.recipient,revisionFirst:{scenario,capture,credit,blocked,paid,duplicate,before,after,releaseBefore,released,releaseAfter},executionFirst:{scenario:executionFirst,firstPayment,lateCredit,finalState,secondBefore,secondAfter},createdAt:new Date().toISOString()};
const output=process.env.KONTOR_EVIDENCE_PATH??`${directory}/proof-evidence.json`;await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(evidence,null,2));console.log(JSON.stringify({evidence:output,cluster:evidence.cluster,stale:blocked.signature,payment800:paid.signature,payment1000:firstPayment.signature}));
