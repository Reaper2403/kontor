# Chain adapter contract

`import { createClient } from './chain/client.mjs'`

`createClient({ rpcUrl, programId, keys, mint, recipient, treasury, treasuryOwner?, commitment = 'confirmed', onPrepared })`

- `keys` holds web3 `Keypair` objects: `registrar`, `reviewer`, `approverA`, `approverB`, `executor`. Never serialize these in app responses. Registrar pays creation; executor pays execution.
- `mint`, `recipient` and `treasury` are base58 strings or PublicKeys. Recipient and treasury are exact SPL token accounts, not wallets. Config v2 immutably binds roles, mint, treasury account and its token owner. Each obligation separately captures its recipient account and owner; constructor recipient is only the default for creation. Optional `treasuryOwner` adds a client expectation checked against config.
- Returns `{createScenario, approve, applyCredit, capturePrevious, testPrevious, pay, releaseRemainder, read, connection, addresses}`.
- All monetary instruction/state values use integer token base units (6 decimals). UI must divide by `1_000_000` explicitly. Original `1000_000_000`, credit `200_000_000`, settlement `800_000_000`.

`createScenario({ id?, recipient?, invoiceDigest?, expiresInSeconds? })` → scenario handle `{id:string, config:string, obligation:string, revisionAddress:string, vault:string, mint:string, recipient:string}`. Defaults random uint64 id, constructor recipient, synthetic invoice SHA256 and one hour approval expiry. Creates configuration if absent, obligation and its program-controlled token vault; **caller must fund vault with 1,000 Test USD before executing**. No faucet or minting occurs implicitly. Reset means call this with a new ID; never clear old state.

`read(handle)` → `{id,revision,paid,amountOriginal,credit,amountDue,invoiceDigest,evidenceDigest,expiry,approvalMask,approvers:[{role,address,approved}],vault,mint,recipient,recipientOwner,treasury,treasuryOwner,config,obligation,revisionAddress,history:[{revision,amount,credit,approvalMask,evidenceDigest,creditDigest,reasonDigest,expiry}]}`. Amounts are decimal strings of base units to avoid JS integer truncation. Addresses/digests are public strings.

`approve(handle, {actor:'approver-a'|'approver-b', expectedRevision})` and `applyCredit(handle,{expectedRevision, amount='200000000', creditDigest?, reasonDigest?})` → `{signature,confirmation:'confirmed',state}`. Wrong actor/error throws a `ChainError` with `code`, `message`, optional `signature` and `confirmation:'failed'|'unknown'`. `applyCredit` always uses reviewer key; server authorization determines which demo persona may invoke it. Program verifies signer independently.

`capturePrevious(handle)` → capture `{signature,blockhash,lastValidBlockHeight,transactionBase64,sha256,revision,amount,expiry,simulation:{err:null,logs},capturedAt}`. This signs an otherwise valid execute, simulates successfully before credit, and sends nothing. Store capture locally; transaction contains public instruction/signatures, never secret keys.

`testPrevious(handle,capture)` → `{signature,confirmation:'failed',error:{code:'StaleRevision',message},state,evidence:{...}}` only when confirmed actual stale rejection occurs. It verifies blockhash+expiry before sending unchanged signed bytes with skipPreflight, collects confirmed transaction logs and before/after vault/recipient balances. Unexpected result/expiry throws and does not count as proof. This method is the separate low-level sender path independent of normal `pay` validation.

`pay(handle,{expectedRevision})` → `{signature,confirmation:'confirmed',state,evidence:{logs,slot,fee,preTokenBalances,postTokenBalances,...}}`. Each invocation constructs a new execution; program rejects a previously paid obligation even under new transaction signature. Server must persist in-flight signature/unknown results, reconcile rather than issue another transfer. Chain methods also attach signature to unknown-outcome errors.

`releaseRemainder(handle)` → `{signature,confirmation:'confirmed',amountReleased,state,evidence}`. Only a paid obligation can release. The program transfers the actual current vault balance to the immutable configured treasury; no caller amount or alternate destination exists. `amountReleased` is a decimal base-unit string established from one successful top-level program release log, never a guessed pre-read balance. Empty release succeeds with zero; later donations may be released to the same treasury. Paid state and supplier payment remain final. Any fee-paying signer may trigger this constrained return. Unknown outcomes retain their signature and require inspection before a completed return is shown.

`addresses(handle, revision?)` exposes canonical PublicKeys for low-level independent tests. Persist scenario handle and capture as JSON; recreate client with the same external key files/config after restart, and call read. Destination comes from the handle; `read` compares it against the immutable obligation. Server must validate persisted/public handles against on-chain state and hide transactionBase64 behind technical demo evidence if it exposes it at all.

`chain/bootstrap.mjs` will export `loadOrCreateKeys(directory)` and `bootstrapTokens(client options)` for operator-only setup; private keys excluded from git. Program keypair/deployment belongs to parent. Only devnet/localnet targets permitted by operator scripts.

`onPrepared({signature, transactionBase64, blockhash, lastValidBlockHeight, kind, handle})` is awaited before every chain-client broadcast, including configuration/scenario creation and the unchanged previous transaction. Throwing cancels submission. Persist it atomically as the durable in-flight journal. Unknown-outcome errors retain signature. `kind` is initialize-config/create-scenario/approve/apply-credit/test-previous/pay/release-remainder.

The default original evidence is exported from `chain/invoice.mjs` as `invoiceDocument`, exact `invoiceDocumentJSON` UTF-8 bytes, and SHA256 `invoiceDocumentDigest`. It matches NF-2026-041 visible fields; do not replace the default with a hash of a transient UI object or placeholder recipient. `read` includes invoiceDocument only when its digest matches this canonical original. Preserve it in evidence export.

Version boundary: Config uses `KNTRCFG2` (232 bytes), Obligation `KNTROBL2` (193 bytes), and the unchanged revision layout uses `KNTRREV1` (217 bytes). V1 config/obligations are rejected. Deploy v2 under a fresh program ID and manifest; preserve legacy receipts, never reinterpret old accounts or claim their remaining tokens were migrated.
