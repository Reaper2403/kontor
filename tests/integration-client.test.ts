import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Keypair, Transaction} from '@solana/web3.js';
import {createClient} from '../chain/client.mjs';

// These tests replace the RPC transport. They verify client failure handling only,
// and deliberately provide no evidence about an executed Solana program.
function fixture(onPrepared: (value:any) => Promise<void> = async () => {}) {
  const keys = Object.fromEntries(['registrar','reviewer','approverA','approverB','executor'].map(role => [role, Keypair.generate()]));
  const client = createClient({treasury:Keypair.generate().publicKey,rpcUrl:'http://127.0.0.1:1', programId:Keypair.generate().publicKey,
    keys, mint:Keypair.generate().publicKey, recipient:Keypair.generate().publicKey,
    onPrepared, onSubmitted:undefined});
  const connection = client.connection as any;
  connection.getLatestBlockhash = async () => ({blockhash:Keypair.generate().publicKey.toBase58(), lastValidBlockHeight:999});
  connection.confirmTransaction = async () => ({value:{err:null}});
  connection.getTransaction = async () => ({slot:10, blockTime:123, meta:{err:null,logMessages:[],fee:5000,preTokenBalances:[],postTokenBalances:[]}});
  return {client, connection, keys, handle:{id:'123'}};
}

test('client persists signed identity before sending and preserves it when RPC loses submission result', async () => {
  let prepared:any;
  const {client, connection, handle} = fixture(async value => {prepared=value;});
  let calls=0;
  connection.sendRawTransaction = async (bytes:Buffer) => {
    calls++;
    assert.ok(prepared.signature);
    assert.equal(prepared.kind, 'pay');
    assert.equal(prepared.transactionBase64, bytes.toString('base64'));
    assert.ok(Transaction.from(bytes).verifySignatures());
    throw new Error('Synthetic RPC response loss');
  };
  await assert.rejects(client.pay(handle,{expectedRevision:0}), (error:any) => {
    assert.equal(error.confirmation,'unknown');
    assert.equal(error.signature,prepared.signature);
    return true;
  });
  assert.equal(calls,1);
});

test('post-confirmation account refresh failure retains the known transaction identity', async () => {
  let prepared:any;
  const {client, connection, handle} = fixture(async value => {prepared=value;});
  connection.sendRawTransaction = async () => prepared.signature;
  connection.getAccountInfo = async () => {throw new Error('Synthetic post-confirmation account RPC outage');};
  await assert.rejects(client.pay(handle,{expectedRevision:0}), (error:any) => {
    assert.equal(error.signature,prepared.signature,'confirmed transaction identity must survive state-refresh failure');
    assert.ok(['confirmed','unknown'].includes(error.confirmation));
    return true;
  });
});

test('client refuses unknown approver before any network submission', async () => {
  const {client, connection, handle} = fixture();
  let calls=0;
  connection.getLatestBlockhash = async () => {calls++; throw new Error('Must not be reached');};
  await assert.rejects(client.approve(handle,{actor:'reviewer',expectedRevision:0}), (error:any) => error.code==='Unauthorized');
  assert.equal(calls,0);
});
