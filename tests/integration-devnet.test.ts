import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Connection, Keypair, PublicKey} from '@solana/web3.js';
import {loadOrCreateKeys} from '../chain/bootstrap.mjs';
import {invoiceDocumentDigest} from '../chain/invoice.mjs';
import {devnetAdapter} from '../server/devnet.js';
import {initialState} from '../server/engine.js';

// In-memory RPC account fixtures only. No devnet calls, app state or browser access.
const hash=(value:string)=>createHash('sha256').update(value).digest();
const u64=(value:number)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(value));return b;};
const zero=Buffer.alloc(32);
async function fixture(t:any, options:{invoiceHash?:string;revised?:boolean;badHandle?:string}={}) {
  const directory=await mkdtemp(join(tmpdir(),'kontor-adapter-test-'));
  const keys:any=await loadOrCreateKeys(join(directory,'keys'));
  const program=Keypair.generate().publicKey, mint=Keypair.generate().publicKey, recipient=Keypair.generate().publicKey, treasury=Keypair.generate().publicKey;
  const config=PublicKey.findProgramAddressSync([Buffer.from('config'),keys.registrar.publicKey.toBuffer()],program)[0];
  const obligation=PublicKey.findProgramAddressSync([Buffer.from('obligation'),config.toBuffer(),u64(42)],program)[0];
  const vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),obligation.toBuffer()],program)[0];
  const revision=(index:number)=>PublicKey.findProgramAddressSync([Buffer.from('revision'),obligation.toBuffer(),u64(index)],program)[0];
  const invoice=Buffer.from(options.invoiceHash??invoiceDocumentDigest,'hex');
  const creditDocument={reference:'CN-LINK',amount:200}, reason='Confirmed service shortfall';
  const creditHash=hash(JSON.stringify(creditDocument)),reasonHash=hash(reason);
  const revised=!!options.revised;
  const obligationData=Buffer.concat([Buffer.from('KNTROBL2'),config.toBuffer(),u64(42),u64(1_000_000_000),invoice,u64(revised?1:0),Buffer.from([0]),vault.toBuffer(),recipient.toBuffer(),keys.recipientOwner.publicKey.toBuffer()]);
  const configData=Buffer.concat([Buffer.from('KNTRCFG2'),...['registrar','reviewer','approverA','approverB'].map(role=>keys[role].publicKey.toBuffer()),mint.toBuffer(),treasury.toBuffer(),keys.registrar.publicKey.toBuffer()]);
  function revisionData(index:number) {
    const credited=index===1;
    const evidence=credited?createHash('sha256').update(Buffer.concat([invoice,creditHash,reasonHash,u64(200_000_000),u64(800_000_000)])).digest():invoice;
    return Buffer.concat([Buffer.from('KNTRREV1'),obligation.toBuffer(),u64(index),u64(credited?800_000_000:1_000_000_000),u64(credited?200_000_000:0),evidence,credited?creditHash:zero,credited?reasonHash:zero,u64(Math.floor(Date.now()/1000)+3600),Buffer.from([0]),u64(0),u64(0),credited?keys.reviewer.publicKey.toBuffer():zero]);
  }
  const accountData=new Map([[config.toBase58(),configData],[obligation.toBase58(),obligationData],[revision(0).toBase58(),revisionData(0)],[revision(1).toBase58(),revisionData(1)]]);
  const originalAccount=Connection.prototype.getAccountInfo,originalBalance=Connection.prototype.getTokenAccountBalance;
  (Connection.prototype as any).getAccountInfo=async (address:PublicKey)=>{
    const data=accountData.get(address.toBase58());
    assert.ok(data,'test must not access an unexpected account');
    return {data,owner:program,executable:false,lamports:1,rentEpoch:0};
  };
  (Connection.prototype as any).getTokenAccountBalance=async()=>({context:{slot:1},value:{amount:'1000000000',decimals:6,uiAmount:1000,uiAmountString:'1000'}});
  t.after(async()=>{Connection.prototype.getAccountInfo=originalAccount;Connection.prototype.getTokenAccountBalance=originalBalance;await rm(directory,{recursive:true,force:true});});
  const handle:any={id:'42',config:config.toBase58(),obligation:obligation.toBase58(),revisionAddress:revision(0).toBase58(),vault:vault.toBase58(),mint:mint.toBase58(),recipient:recipient.toBase58()};
  if(options.badHandle)handle[options.badHandle]=Keypair.generate().publicKey.toBase58();
  const file=join(directory,'manifest.json');
  await writeFile(file,JSON.stringify({rpcUrl:'https://api.devnet.solana.com',programId:program.toBase58(),mint:mint.toBase58(),recipient:recipient.toBase58(),treasury:treasury.toBase58(),handle,keyDir:join(directory,'keys')}));
  const state=initialState();
  if(revised){state.revision=2;state.amountDue=800;state.credit=200;state.creditNote={...creditDocument,reason,at:new Date().toISOString()};}
  return {file,state};
}

test('adapter links valid canonical invoice and credit documents',async t=>{
  const {file,state}=await fixture(t,{revised:true});
  const adapter=await devnetAdapter(file);
  const linked=await adapter.link(state);
  assert.equal(linked.mode,'devnet');
  assert.equal(linked.amountDue,800);
});

test('adapter refuses to export canonical invoice as committed when chain digest differs',async t=>{
  const {file,state}=await fixture(t,{invoiceHash:'ab'.repeat(32)});
  await assert.rejects(async()=>{const adapter=await devnetAdapter(file);await adapter.link(state);},/invoice.*digest/i);
});

for(const field of ['obligation','vault','mint','recipient','config','revisionAddress']){
  test(`adapter rejects noncanonical persisted handle ${field}`,async t=>{
    const {file,state}=await fixture(t,{badHandle:field});
    await assert.rejects(async()=>{const adapter=await devnetAdapter(file);await adapter.link(state);},/account mismatch|Noncanonical obligation/i);
  });
}

for(const field of ['reference','reason'] as const){
  test(`adapter rejects saved credit ${field} that does not match committed digest`,async t=>{
    const {file,state}=await fixture(t,{revised:true});
    state.creditNote![field]='Uncommitted replacement text';
    await assert.rejects(async()=>{const adapter=await devnetAdapter(file);await adapter.link(state);},/credit.*digest/i);
  });
}

test('adapter rejects saved supplier metadata that differs from committed invoice',async t=>{
  const {file,state}=await fixture(t);
  state.invoice.supplier='Uncommitted supplier';
  await assert.rejects(async()=>{const adapter=await devnetAdapter(file);await adapter.link(state);},/invoice.*committed/i);
});

test('pending state differing from network remains unknown and never silently relinks',async t=>{
  const {file,state}=await fixture(t);
  state.revision=2;state.credit=200;state.amountDue=800;
  state.operation={type:'apply-credit',status:'pending',message:'Awaiting confirmation'};
  const adapter=await devnetAdapter(file);
  const linked=await adapter.link(state);
  assert.equal(linked.operation?.status,'unknown');
  assert.equal(linked.revision,2);
});
