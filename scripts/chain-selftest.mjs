import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { createTransferInstruction, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createClient, digest } from '../chain/client.mjs';
import { loadOrCreateKeys, bootstrapTokens, fundScenario } from '../chain/bootstrap.mjs';

const rpcUrl=process.env.KONTOR_RPC_URL??'http://127.0.0.1:8899';
const local=/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(rpcUrl);
if(!local&&!(rpcUrl==='https://api.devnet.solana.com'&&process.env.KONTOR_ALLOW_DEVNET==='1'))throw new Error('Tests require local validator or explicitly authorized devnet');
const programId=process.env.KONTOR_PROGRAM_ID;if(!programId)throw new Error('Set KONTOR_PROGRAM_ID to the loaded compiled program');
const directory=process.env.KONTOR_KEY_DIR??'/tmp/kontor-chain-test-keys';
const keys=await loadOrCreateKeys(directory),connection=new Connection(rpcUrl,'confirmed');
const program=await connection.getAccountInfo(new PublicKey(programId));assert.ok(program?.executable,'Actual compiled program must be loaded');
if(local){const signature=await connection.requestAirdrop(keys.registrar.publicKey,10_000_000_000);await connection.confirmTransaction(signature,'confirmed');}
const tokens=await bootstrapTokens({rpcUrl,keys,directory}),client=createClient({...tokens,programId,keys});
const checks=[],scenarios=[],transactions=[];
function pass(name,extra={}){checks.push({name,status:'PASS',...extra});console.log(`PASS ${name}`);}
async function rejected(name,run,code){let caught;try{await run();}catch(error){caught=error;}assert.ok(caught,`${name}: expected rejection`);assert.equal(caught.confirmation,'failed',`${name}: must be an actually confirmed failed transaction`);if(code)assert.equal(caught.code,code,`${name}: wrong program failure`);assert.ok(caught.signature);transactions.push({name,signature:caught.signature,...caught.evidence});pass(name,{signature:caught.signature,code:caught.code});return caught;}
async function scenario(funded=true,options={}){const handle=await client.createScenario(options);scenarios.push(handle);if(funded)await fundScenario({client,handle,keys});return handle;}
async function approvals(handle,revision=0){await client.approve(handle,{actor:'approver-a',expectedRevision:revision});await client.approve(handle,{actor:'approver-b',expectedRevision:revision});}
function change(ix,index,pubkey){ix.keys[index]={...ix.keys[index],pubkey:new PublicKey(pubkey)};return ix;}

const main=await scenario();
await rejected('payment needs two approvals',()=>client.pay(main,{expectedRevision:0}),'MissingApprovals');
await client.approve(main,{actor:'approver-a',expectedRevision:0});
await rejected('one signer cannot count twice',()=>client.approve(main,{actor:'approver-a',expectedRevision:0}),'DuplicateApproval');
await rejected('unconfigured signer cannot approve',()=>client.testing.submit(client.testing.approveIx(main,keys.executor,0),keys.executor),'Unauthorized');
await rejected('unconfigured signer cannot accept credit',()=>client.testing.submit(client.testing.creditIx(main,{expectedRevision:0},keys.executor),keys.executor),'Unauthorized');
await client.approve(main,{actor:'approver-b',expectedRevision:0});
const alternateRecipient=await getOrCreateAssociatedTokenAccount(connection,keys.registrar,new PublicKey(tokens.mint),keys.registrar.publicKey);
await rejected('destination substitution rejected',()=>client.testing.submit(change(client.testing.executeIx(main,0),6,alternateRecipient.address),keys.executor),'InvalidAccount');
await rejected('token program substitution rejected',()=>client.testing.submit(change(client.testing.executeIx(main,0),7,SystemProgram.programId),keys.executor),'InvalidAccount');
await rejected('mint substitution rejected',()=>client.testing.submit(change(client.testing.executeIx(main,0),5,keys.recipientOwner.publicKey),keys.executor),'InvalidAccount');
await rejected('source and recipient alias rejected',()=>client.testing.submit(change(client.testing.executeIx(main,0),6,main.vault),keys.executor),'AliasedAccount');
const alternate=await scenario(false);
await rejected('obligation/revision substitution rejected',()=>client.testing.submit(change(client.testing.executeIx(main,0),2,alternate.obligation),keys.executor),'InvalidAccount');
await rejected('raw token transfer cannot sign PDA vault',()=>client.testing.submit(createTransferInstruction(new PublicKey(main.vault),new PublicKey(main.recipient),keys.executor.publicKey,1n),keys.executor));
await rejected('credit exceeding amount rejected',()=>client.applyCredit(main,{expectedRevision:0,amount:'1000000001'}),'InvalidAmount');
await rejected('zero credit rejected',()=>client.applyCredit(main,{expectedRevision:0,amount:'0'}),'InvalidAmount');
await rejected('malformed instruction rejected',()=>{const ix=client.testing.executeIx(main,0);ix.data=Buffer.from([4]);return client.testing.submit(ix,keys.executor);},'InvalidInstruction');

// Time-sensitive evidence: no negative test or user wait between capture, revision and replay.
const capture=await client.capturePrevious(main);const capturedHash=capture.sha256;
const replayRequest=`${directory}/replay-request.json`;await writeFile(replayRequest,JSON.stringify({...tokens,programId,scenario:main,capture}));
await client.applyCredit(main,{expectedRevision:0});
const replay=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./chain-replay.mjs',import.meta.url)),replayRequest],{env:{...process.env,KONTOR_KEY_DIR:directory},maxBuffer:2_000_000});
const blocked=JSON.parse(replay.stdout);assert.equal(capturedHash,digest(Buffer.from(capture.transactionBase64,'base64')).toString('hex'));
assert.equal(blocked.evidence.tokenMovement,'0');assert.equal(blocked.error.code,'StaleRevision');transactions.push({name:'revision-first old bytes rejected',...blocked.evidence});pass('revision-first unchanged signed transaction rejected with zero movement',{signature:blocked.signature});
const revised=await client.read(main);assert.equal(revised.amountDue,'800000000');assert.equal(revised.credit,'200000000');assert.equal(revised.approvalMask,0);assert.equal(revised.history[0].approvalMask,3);pass('credit preserves original approval history and requires fresh approvals');
await rejected('same credit request cannot double apply',()=>client.applyCredit(main,{expectedRevision:0}),'StaleRevision');
await rejected('second credit under new revision rejected',()=>client.applyCredit(main,{expectedRevision:1}),'CreditAlreadyApplied');
await rejected('old approvals cannot settle new revision',()=>client.pay(main,{expectedRevision:1}),'MissingApprovals');
await approvals(main,1);const before=await client.testing.balances(main);const paid=await client.pay(main,{expectedRevision:1});const after=await client.testing.balances(main);
assert.equal(BigInt(before.vault)-BigInt(after.vault),800000000n);assert.equal(BigInt(after.recipient)-BigInt(before.recipient),800000000n);assert.equal(paid.state.paid,true);transactions.push({name:'fresh800paid',...paid.evidence});pass('fresh two approvals pay exactly 800 once',{signature:paid.signature,before,after});
await rejected('new transaction cannot pay twice',()=>client.pay(main,{expectedRevision:1}),'AlreadyPaid');
await rejected('paid obligation rejects credit',()=>client.applyCredit(main,{expectedRevision:1}),'AlreadyPaid');

// Insufficient vault balance makes token CPI fail after paid mutation; chain rollback must restore unpaid.
await approvals(alternate);await rejected('SPL CPI failure is a confirmed failed transaction',()=>client.pay(alternate,{expectedRevision:0}));
assert.equal((await client.read(alternate)).paid,false);assert.equal((await client.read(alternate)).approvalMask,3);pass('failed token CPI rolls paid state back');
await fundScenario({client,handle:alternate,keys});const first=await client.pay(alternate,{expectedRevision:0});assert.equal(first.state.paid,true);pass('normal invoice executes 1000',{signature:first.signature});transactions.push({name:'execution-first1000',...first.evidence});
const beforeRejectedRevision=await client.testing.balances(alternate);await rejected('execution-first credit rejects without reopening',()=>client.applyCredit(alternate,{expectedRevision:0}),'AlreadyPaid');assert.deepEqual(await client.testing.balances(alternate),beforeRejectedRevision);assert.equal((await client.read(alternate)).revision,0);pass('execution-first finality permits no second 800 settlement');

const expired=await scenario(true,{expiresInSeconds:12});await approvals(expired);const expireAt=(await client.read(expired)).expiry;
while(Math.floor(Date.now()/1000)<=expireAt+1)await new Promise(r=>setTimeout(r,500));
await rejected('expired approvals reject on chain',()=>client.pay(expired,{expectedRevision:0}),'ApprovalExpired');

const output={kind:'actual-compiled-SBF-integration',cluster:local?'localnet':'devnet',rpcUrl,programId,asset:'Test USD',mint:tokens.mint,passed:checks.length,checks,scenarios,transactions,staleProof:{capture,blocked},finishedAt:new Date().toISOString()};
const outputPath=process.env.KONTOR_EVIDENCE_PATH??'chain-evidence.json';await mkdir(dirname(outputPath),{recursive:true});await writeFile(outputPath,JSON.stringify(output,null,2));console.log(JSON.stringify({passed:checks.length,evidence:outputPath,cluster:output.cluster,programId}));
