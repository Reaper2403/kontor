import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, getMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount } from '@solana/spl-token';

export async function loadOrCreateKeys(directory) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const result={};for(const name of ['registrar','reviewer','approverA','approverB','executor','recipientOwner','mint']){
    const path=join(directory,`${name}.json`);
    try {result[name]=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(path,'utf8'))));}
    catch(error){if(error.code!=='ENOENT')throw error;const key=Keypair.generate();await writeFile(path,JSON.stringify([...key.secretKey]),{mode:0o600,flag:'wx'});result[name]=key;}
  }return result;
}
export async function bootstrapTokens({rpcUrl,keys,directory}) {
  const connection=new Connection(rpcUrl,'confirmed');
  const mint=keys.mint.publicKey;
  try {await getMint(connection,mint);}catch(error){const exists=await connection.getAccountInfo(mint);if(exists)throw error;await createMint(connection,keys.registrar,keys.registrar.publicKey,null,6,keys.mint,undefined,undefined);}
  const recipient=await getOrCreateAssociatedTokenAccount(connection,keys.registrar,mint,keys.recipientOwner.publicKey);
  const treasury=await getOrCreateAssociatedTokenAccount(connection,keys.registrar,mint,keys.registrar.publicKey);
  const transfers=[];for(const role of ['reviewer','approverA','approverB','executor']){const balance=await connection.getBalance(keys[role].publicKey);if(balance<10_000_000)transfers.push(SystemProgram.transfer({fromPubkey:keys.registrar.publicKey,toPubkey:keys[role].publicKey,lamports:30_000_000-balance}));}
  if(transfers.length)await sendAndConfirmTransaction(connection,new Transaction().add(...transfers),[keys.registrar],{commitment:'confirmed'});
  const manifest={rpcUrl,mint:mint.toBase58(),recipient:recipient.address.toBase58(),recipientOwner:keys.recipientOwner.publicKey.toBase58(),treasury:treasury.address.toBase58(),treasuryOwner:keys.registrar.publicKey.toBase58(),roles:Object.fromEntries(['registrar','reviewer','approverA','approverB','executor'].map(role=>[role,keys[role].publicKey.toBase58()])),asset:'Test USD',decimals:6};
  if(directory)await writeFile(join(directory,'public-tokens.json'),JSON.stringify(manifest,null,2));return manifest;
}
export async function fundScenario({client,handle,keys,amount=1_000_000_000n}) {
  const vault=new PublicKey(handle.vault),mint=new PublicKey(handle.mint);
  const before=await getAccount(client.connection,vault);
  // Operator-only synthetic issuance. Never a withdrawal/transfer path from a protected vault.
  const missing=BigInt(amount)-before.amount;if(missing<=0n)return null;
  return mintTo(client.connection,keys.registrar,mint,vault,keys.registrar,missing,[],{commitment:'confirmed'});
}
