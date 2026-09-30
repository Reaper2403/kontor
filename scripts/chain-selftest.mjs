import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { AuthorityType, createApproveInstruction, createTransferInstruction, createMint, freezeAccount, getMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, thawAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createClient, digest, releasedAmount } from '../chain/client.mjs';
import { loadOrCreateKeys, bootstrapTokens, fundScenario } from '../chain/bootstrap.mjs';

const rpcUrl=process.env.KONTOR_RPC_URL??'http://127.0.0.1:8899';
const local=/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(rpcUrl);
if(!local&&!(rpcUrl==='https://api.devnet.solana.com'&&process.env.KONTOR_ALLOW_DEVNET==='1'))throw new Error('Tests require local validator or explicitly authorized devnet');
const programId=process.env.KONTOR_PROGRAM_ID;if(!programId)throw new Error('Set KONTOR_PROGRAM_ID to the loaded compiled program');
const directory=process.env.KONTOR_KEY_DIR??'/tmp/kontor-chain-test-keys';
const keys=await loadOrCreateKeys(directory),connection=new Connection(rpcUrl,'confirmed');
const program=await connection.getAccountInfo(new PublicKey(programId));assert.ok(program?.executable,'Actual compiled program must be loaded');
if(local){const signature=await connection.requestAirdrop(keys.registrar.publicKey,10_000_000_000);await connection.confirmTransaction(signature,'confirmed');}
// This isolated adversarial-test mint has a freeze authority solely to exercise frozen destinations.
// Normal bootstrap still creates a mint with no freeze authority.
if(!await connection.getAccountInfo(keys.mint.publicKey))await createMint(connection,keys.registrar,keys.registrar.publicKey,keys.registrar.publicKey,6,keys.mint);
assert.ok((await getMint(connection,keys.mint.publicKey)).freezeAuthority?.equals(keys.registrar.publicKey),'Use fresh selftest keys/mint with registrar freeze authority');
const tokens=await bootstrapTokens({rpcUrl,keys,directory}),client=createClient({...tokens,programId,keys});
const checks=[],scenarios=[],transactions=[];
function pass(name,extra={}){checks.push({name,status:'PASS',...extra});console.log(`PASS ${name}`);}
async function rejected(name,run,code){let caught;try{await run();}catch(error){caught=error;}assert.ok(caught,`${name}: expected rejection`);assert.equal(caught.confirmation,'failed',`${name}: must be an actually confirmed failed transaction`);if(code)assert.equal(caught.code,code,`${name}: wrong program failure`);assert.ok(caught.signature);transactions.push({name,signature:caught.signature,...caught.evidence});pass(name,{signature:caught.signature,code:caught.code});return caught;}
async function scenario(funded=true,options={}){const handle=await client.createScenario(options);scenarios.push(handle);if(funded)await fundScenario({client,handle,keys});return handle;}
async function approvals(handle,revision=0){await client.approve(handle,{actor:'approver-a',expectedRevision:revision});await client.approve(handle,{actor:'approver-b',expectedRevision:revision});}
function change(ix,index,pubkey){ix.keys[index]={...ix.keys[index],pubkey:new PublicKey(pubkey)};return ix;}

const main=await scenario();
const beforePremature=await client.testing.releaseBalances(main);
await rejected('unpaid obligation cannot release remainder',()=>client.releaseRemainder(main),'NotPaid');
assert.deepEqual(await client.testing.releaseBalances(main),beforePremature);assert.equal((await client.read(main)).paid,false);
pass('premature release preserves all token balances and unpaid state');
await rejected('payment needs two approvals',()=>client.pay(main,{expectedRevision:0}),'MissingApprovals');
await client.approve(main,{actor:'approver-a',expectedRevision:0});
await rejected('one signer cannot count twice',()=>client.approve(main,{actor:'approver-a',expectedRevision:0}),'DuplicateApproval');
await rejected('configured identity still needs its signature',()=>{const ix=client.testing.approveIx(main,keys.approverB,0);ix.keys[0].isSigner=false;return client.testing.submit(ix,keys.executor);},'Unauthorized');
await rejected('unconfigured signer cannot approve',()=>client.testing.submit(client.testing.approveIx(main,keys.executor,0),keys.executor),'Unauthorized');
await rejected('unconfigured signer cannot accept credit',()=>client.testing.submit(client.testing.creditIx(main,{expectedRevision:0},keys.executor),keys.executor),'Unauthorized');
await client.approve(main,{actor:'approver-b',expectedRevision:0});
const secondOwner=Keypair.generate();
const alternateRecipient=await getOrCreateAssociatedTokenAccount(connection,keys.registrar,new PublicKey(tokens.mint),secondOwner.publicKey);
await rejected('destination substitution rejected',()=>client.testing.submit(change(client.testing.executeIx(main,0),6,alternateRecipient.address),keys.executor),'InvalidAccount');
await rejected('token program substitution rejected',()=>client.testing.submit(change(client.testing.executeIx(main,0),7,SystemProgram.programId),keys.executor),'InvalidAccount');
await rejected('mint substitution rejected',()=>client.testing.submit(change(client.testing.executeIx(main,0),5,keys.recipientOwner.publicKey),keys.executor),'InvalidAccount');
await rejected('source and recipient alias rejected',()=>client.testing.submit(change(client.testing.executeIx(main,0),6,main.vault),keys.executor),'AliasedAccount');
const alternate=await scenario(false,{recipient:alternateRecipient.address});
assert.equal(main.config,alternate.config);assert.notEqual(main.recipient,alternate.recipient);
assert.equal((await client.read(alternate)).recipientOwner,secondOwner.publicKey.toBase58());
pass('one configuration records two immutable obligation recipients');
await assert.rejects(client.read({...alternate,recipient:main.recipient}),e=>e.code==='InvalidAccount');pass('client rejects recipient handle substitution');
await freezeAccount(connection,keys.registrar,alternateRecipient.address,new PublicKey(tokens.mint),keys.registrar);
await rejected('frozen recipient rejected at obligation creation',()=>scenario(false,{recipient:alternateRecipient.address}),'InvalidAccount');
await thawAccount(connection,keys.registrar,alternateRecipient.address,new PublicKey(tokens.mint),keys.registrar);
const otherMint=await createMint(connection,keys.registrar,keys.registrar.publicKey,null,6);
const wrongMintRecipient=await getOrCreateAssociatedTokenAccount(connection,keys.registrar,otherMint,keys.recipientOwner.publicKey);
await rejected('wrong-mint recipient rejected at creation',()=>scenario(false,{recipient:wrongMintRecipient.address}),'InvalidAccount');
await rejected('non-token recipient rejected at creation',()=>scenario(false,{recipient:keys.recipientOwner.publicKey}),'InvalidAccount');
const uninitializedSeed=`uninit-${Date.now()}`,uninitialized=await PublicKey.createWithSeed(keys.registrar.publicKey,uninitializedSeed,TOKEN_PROGRAM_ID);
await client.testing.submit(SystemProgram.createAccountWithSeed({fromPubkey:keys.registrar.publicKey,basePubkey:keys.registrar.publicKey,seed:uninitializedSeed,newAccountPubkey:uninitialized,lamports:await connection.getMinimumBalanceForRentExemption(165),space:165,programId:TOKEN_PROGRAM_ID}),keys.registrar);
await rejected('uninitialized token recipient rejected at creation',()=>scenario(false,{recipient:uninitialized}),'InvalidAccount');
// A change of the same token account owner must not silently redirect approved settlement.
await setAuthority(connection,keys.registrar,new PublicKey(main.recipient),keys.recipientOwner,AuthorityType.AccountOwner,secondOwner.publicKey);
await rejected('recipient owner changes invalidate payment',()=>client.pay(main,{expectedRevision:0}),'InvalidAccount');
await setAuthority(connection,keys.registrar,new PublicKey(main.recipient),secondOwner,AuthorityType.AccountOwner,keys.recipientOwner.publicKey);
await freezeAccount(connection,keys.registrar,new PublicKey(main.recipient),new PublicKey(tokens.mint),keys.registrar);
await rejected('frozen recipient rejects payment',()=>client.pay(main,{expectedRevision:0}),'InvalidAccount');
await thawAccount(connection,keys.registrar,new PublicKey(main.recipient),new PublicKey(tokens.mint),keys.registrar);
await rejected('obligation/revision substitution rejected',()=>client.testing.submit(change(client.testing.executeIx(main,0),2,alternate.obligation),keys.executor),'InvalidAccount');
await rejected('raw token transfer cannot sign PDA vault',()=>client.testing.submit(createTransferInstruction(new PublicKey(main.vault),new PublicKey(main.recipient),keys.executor.publicKey,1n),keys.executor));
await rejected('raw token delegation cannot authorize vault spending',()=>client.testing.submit(createApproveInstruction(new PublicKey(main.vault),keys.approverB.publicKey,keys.executor.publicKey,1n),keys.executor));
await rejected('credit exceeding amount rejected',()=>client.applyCredit(main,{expectedRevision:0,amount:'1000000001'}),'InvalidAmount');
await rejected('zero credit rejected',()=>client.applyCredit(main,{expectedRevision:0,amount:'0'}),'InvalidAmount');
await rejected('execution cannot inject an alternate amount',()=>{const ix=client.testing.executeIx(main,0);ix.data=Buffer.concat([ix.data,Buffer.alloc(8)]);return client.testing.submit(ix,keys.executor);},'InvalidInstruction');
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
await rejected('canonical paid obligation cannot be reinitialized',()=>client.createScenario({id:main.id}),'InvalidAccount');
await rejected('paid obligation rejects credit',()=>client.applyCredit(main,{expectedRevision:1}),'AlreadyPaid');

// Every failed release is a real compiled-program transaction and preserves the successful payment.
const paidState=await client.read(main),beforeRelease=await client.testing.releaseBalances(main);
await rejected('release cannot substitute supplier for treasury',()=>client.testing.submit(change(client.testing.releaseRemainderIx(main),5,main.recipient),keys.executor),'InvalidAccount');
await rejected('release cannot substitute another same-mint treasury',()=>client.testing.submit(change(client.testing.releaseRemainderIx(main),5,alternateRecipient.address),keys.executor),'InvalidAccount');
await rejected('release cannot substitute wrong-mint destination',()=>client.testing.submit(change(client.testing.releaseRemainderIx(main),5,wrongMintRecipient.address),keys.executor),'InvalidAccount');
await rejected('release rejects token-program substitution',()=>client.testing.submit(change(client.testing.releaseRemainderIx(main),6,SystemProgram.programId),keys.executor),'InvalidAccount');
await rejected('release rejects mint substitution',()=>client.testing.submit(change(client.testing.releaseRemainderIx(main),4,otherMint),keys.executor),'InvalidAccount');
await rejected('release rejects another obligation vault',()=>client.testing.submit(change(client.testing.releaseRemainderIx(main),3,alternate.vault),keys.executor),'InvalidAccount');
await rejected('release rejects source-destination alias',()=>client.testing.submit(change(client.testing.releaseRemainderIx(main),5,main.vault),keys.executor),'AliasedAccount');
await rejected('release requires its executor signature',()=>{const ix=client.testing.releaseRemainderIx(main);ix.keys[0].isSigner=false;return client.testing.submit(ix,keys.approverA);},'Unauthorized');
await rejected('release cannot accept a caller amount',()=>{const ix=client.testing.releaseRemainderIx(main);ix.data=Buffer.concat([ix.data,Buffer.alloc(8)]);return client.testing.submit(ix,keys.executor);},'InvalidInstruction');
await setAuthority(connection,keys.registrar,new PublicKey(tokens.treasury),keys.registrar,AuthorityType.AccountOwner,secondOwner.publicKey);
await rejected('treasury owner changes reject release',()=>client.releaseRemainder(main),'InvalidAccount');
await setAuthority(connection,keys.registrar,new PublicKey(tokens.treasury),secondOwner,AuthorityType.AccountOwner,keys.registrar.publicKey);
await freezeAccount(connection,keys.registrar,new PublicKey(tokens.treasury),new PublicKey(tokens.mint),keys.registrar);
await rejected('frozen treasury rejects release',()=>client.releaseRemainder(main),'InvalidAccount');
// Initialization also rejects a frozen configured treasury before any config account creation.
const frozenConfigClient=createClient({...tokens,programId,keys:{...keys,registrar:keys.reviewer}});
await rejected('frozen treasury rejects configuration creation',()=>frozenConfigClient.createScenario(),'InvalidAccount');
await thawAccount(connection,keys.registrar,new PublicKey(tokens.treasury),new PublicKey(tokens.mint),keys.registrar);
assert.deepEqual(await client.testing.releaseBalances(main),beforeRelease);assert.deepEqual(await client.read(main),paidState);
pass('invalid releases preserve balances and all paid obligation state');
const released=await client.releaseRemainder(main),afterRelease=await client.testing.releaseBalances(main);
assert.equal(released.amountReleased,'200000000');assert.equal(afterRelease.vault,'0');assert.equal(afterRelease.recipient,beforeRelease.recipient);assert.equal(BigInt(afterRelease.treasury)-BigInt(beforeRelease.treasury),200000000n);
assert.deepEqual(released.state,paidState);transactions.push({name:'paid remainder returns200',...released.evidence});pass('paid remainder returns exactly200 only to configured treasury',{signature:released.signature,before:beforeRelease,after:afterRelease});
const repeated=await client.releaseRemainder(main);assert.equal(repeated.amountReleased,'0');assert.deepEqual(await client.testing.releaseBalances(main),afterRelease);pass('empty repeat release succeeds without token movement',{signature:repeated.signature});
await rejected('even empty release validates fixed treasury',()=>client.testing.submit(change(client.testing.releaseRemainderIx(main),5,alternateRecipient.address),keys.executor),'InvalidAccount');
const otherExecutor=await client.testing.submit(client.testing.releaseRemainderIx(main,keys.approverA),keys.approverA);assert.equal(releasedAmount(otherExecutor.evidence,new PublicKey(programId)),'0');pass('any signed caller can trigger only the fixed treasury release',{signature:otherExecutor.signature});
await rejected('release never reopens supplier payment',()=>client.pay(main,{expectedRevision:1}),'AlreadyPaid');
await client.testing.submit(createTransferInstruction(new PublicKey(tokens.treasury),new PublicKey(main.vault),keys.registrar.publicKey,7n),keys.registrar);
const dustBefore=await client.testing.releaseBalances(main);
const dust=await client.releaseRemainder(main),dustAfter=await client.testing.releaseBalances(main);assert.equal(dust.amountReleased,'7');assert.equal(dustAfter.vault,'0');assert.equal(dustAfter.recipient,dustBefore.recipient);assert.equal(BigInt(dustAfter.treasury)-BigInt(dustBefore.treasury),7n);pass('later donated dust returns to the same treasury',{signature:dust.signature});


// Insufficient vault balance makes token CPI fail after paid mutation; chain rollback must restore unpaid.
await approvals(alternate);await rejected('second obligation cannot use first recipient',()=>client.testing.submit(change(client.testing.executeIx(alternate,0),6,main.recipient),keys.executor),'InvalidAccount');await rejected('SPL CPI failure is a confirmed failed transaction',()=>client.pay(alternate,{expectedRevision:0}));
assert.equal((await client.read(alternate)).paid,false);assert.equal((await client.read(alternate)).approvalMask,3);pass('failed token CPI rolls paid state back');
await fundScenario({client,handle:alternate,keys});const secondBefore=await client.testing.releaseBalances(alternate),firstRecipientBefore=(await connection.getTokenAccountBalance(new PublicKey(main.recipient))).value.amount;const first=await client.pay(alternate,{expectedRevision:0});const secondAfter=await client.testing.releaseBalances(alternate);assert.equal(BigInt(secondAfter.recipient)-BigInt(secondBefore.recipient),1000000000n);assert.equal((await connection.getTokenAccountBalance(new PublicKey(main.recipient))).value.amount,firstRecipientBefore);assert.equal(first.state.paid,true);pass('normal invoice executes 1000',{signature:first.signature});transactions.push({name:'execution-first1000',...first.evidence});
const beforeRejectedRevision=await client.testing.balances(alternate);await rejected('execution-first credit rejects without reopening',()=>client.applyCredit(alternate,{expectedRevision:0}),'AlreadyPaid');assert.deepEqual(await client.testing.balances(alternate),beforeRejectedRevision);assert.equal((await client.read(alternate)).revision,0);pass('execution-first finality permits no second 800 settlement');

const noCreditRelease=await client.releaseRemainder(alternate);assert.equal(noCreditRelease.amountReleased,'0');pass('fully funded no-credit payment has zero remainder',{signature:noCreditRelease.signature});
const overfunded=await scenario();await fundScenario({client,handle:overfunded,keys,amount:1_250_000_000n});await approvals(overfunded);await client.pay(overfunded,{expectedRevision:0});const overBefore=await client.testing.releaseBalances(overfunded),over=await client.releaseRemainder(overfunded),overAfter=await client.testing.releaseBalances(overfunded);assert.equal(over.amountReleased,'250000000');assert.equal(BigInt(overAfter.treasury)-BigInt(overBefore.treasury),250000000n);assert.equal(overAfter.recipient,overBefore.recipient);assert.equal(overAfter.vault,'0');pass('overfunded no-credit release uses actual250 remainder',{signature:over.signature});

const expired=await scenario(true,{expiresInSeconds:12});await approvals(expired);const expireAt=(await client.read(expired)).expiry;
while(Math.floor(Date.now()/1000)<=expireAt+1)await new Promise(r=>setTimeout(r,500));
await rejected('expired approvals reject on chain',()=>client.pay(expired,{expectedRevision:0}),'ApprovalExpired');

const output={kind:'actual-compiled-SBF-integration',cluster:local?'localnet':'devnet',rpcUrl,programId,asset:'Test USD',mint:tokens.mint,treasury:tokens.treasury,treasuryOwner:tokens.treasuryOwner,protocolVersion:2,passed:checks.length,checks,scenarios,transactions,staleProof:{capture,blocked},finishedAt:new Date().toISOString()};
const outputPath=process.env.KONTOR_EVIDENCE_PATH??`${directory}/chain-evidence.json`;await mkdir(dirname(outputPath),{recursive:true});await writeFile(outputPath,JSON.stringify(output,null,2));console.log(JSON.stringify({passed:checks.length,evidence:outputPath,cluster:output.cluster,programId}));
