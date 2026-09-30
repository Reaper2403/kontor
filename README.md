# Kontor

A payable workbench that keeps approval tied to the amount and recipient being paid. Built for the Build at WHU hackathon.

**[Explore the interactive product tour →](https://reaper2403.github.io/kontor-tour/)**

Follow a **1,000 invoice → 200 credit → 800 supplier payment → 200 treasury return** using the actual app interface. No installation or wallet is needed. The tour replays recorded Solana devnet evidence; clicks send no transactions.

## The demonstration

1. Hamburg GmbH receives Northform Studio’s invoice for **1,000 Test USD**.
2. Mara and Jonas each approve that invoice version and its fixed recipient.
3. Lena applies a **200** credit. The payable becomes **800**, and earlier approvals no longer authorize payment.
4. Alex tests the retained 1,000 instruction. The actual Solana program rejects its obsolete revision; no Test USD moves.
5. Two fresh approvals authorize **800** to the supplier.
6. After payment, **Return remainder** sends the remaining **200** only to the treasury fixed in configuration. The vault reaches **zero**, with a separate transaction receipt.

The saved instruction uses a recent Solana blockhash. Run the control check promptly: after several minutes it may expire. Reset creates a new payable and preserves the previous local scenario.

## Why the control matters

An approval is attached to an immutable invoice recipient and a particular amount/revision. A correction invalidates the old authorization before payment. Supplier settlement and the return of unused reserves remain separate, inspectable events.

Each obligation can have a different recipient under the same configuration. The program supports multiple contractors; the interface deliberately shows one selected synthetic invoice. The treasury destination cannot be chosen or changed by the person triggering a return. Returns use the actual vault remainder, including excess funding or later deposits. Repeating an empty return moves nothing and never reopens supplier payment.

## Run locally

Node.js 22 or later:

```sh
npm ci
npm run server
```

In another terminal:

```sh
npm run dev
```

Open the address printed by the development server. Without network configuration, the app clearly identifies a **local rehearsal**, generates no transaction links and moves no network tokens.

For a configured v2 devnet workspace:

```sh
KONTOR_DEVNET_MANIFEST="$PWD/.local/v2/devnet.json" KONTOR_STATE_FILE="$PWD/.local/v2/state.json" npm run server
```

Deploy/setup your own keys and manifest using [the chain setup guide](chain/BUILD.md). Signing keys stay in excluded `.local/` files; none are shipped in this public source repository.

## Verified behavior

The current [v2 devnet program](https://explorer.solana.com/address/CZvXgXBgFYfNef1uJYixrP86EbAcaRKoZ5sbH7qWPhyP?cluster=devnet) and its deployment fingerprint are recorded in [the v2 summary](evidence/devnet-v2-summary.json). [The v2 ordering proof](evidence/devnet-v2-ordering-proof.json) demonstrates stale-payment rejection, separate treasury return, two different recipients under one configuration, and payment-first finality. [The recorded UI workflow](evidence/devnet-v2-demo.json) links the eight actual transactions used by the tour.

[Compiled-program evidence](evidence/compiled-program-v2-proof.json) comes from executing the Rust binary on a disposable Solana validator. It includes adversarial recipient/treasury substitutions, changed owners, frozen accounts, premature release, duplicate payment, empty returns, donated dust and excess funding. Client/service fixtures and rehearsal browser checks are separate from this on-chain evidence.

Run `npm test`, `npm run build` and `npm run build:tour`. The compiled-program workflow builds and tests the same source revision. Rust formatting is checked in CI. The tour build audits its static publication files.

## Scope and limits

- **Test USD is synthetic and has no monetary value.** It is not Circle USDC.
- Protection covers the program-controlled obligation and vault. External wallets and other payment rails are outside that boundary.
- Demo roles use server-held keys. This is not production authentication or custody; the program has a trusted upgrade authority and has not received an independent security audit.
- One partial credit per payable; no full credit, invoice cancellation or withdrawal from an unpaid obligation. A paid-only return does not solve those cases.
- One selected synthetic invoice in the UI, JSON evidence export and whole-unit invoice entry. No invoice extraction, DATEV integration, ramps, swaps or certified accounting treatment.
- Unknown network results block new actions. Approval-only **Check status** verifies the exact saved transaction and expected state without resending. Uncertain payments, credits, treasury returns, resets and control checks require operator assistance. A confirmed supplier payment remains visible if its later treasury return is unresolved.
- V2 uses a fresh program and account layout. Historical v1 proofs remain unchanged, including [the earlier tour record](evidence/tour-v1-recorded-evidence.json). Its old 200 reserve was not migrated or returned by the v2 deployment.

## Public guided tour

Build with `npm run build:tour`. Publish only audited `dist-tour/` assets; never publish `.local/` signing keys. The static tour has no backend, RPC calls or signing capability. Intermediate screens are reconstructed from one recorded event history, and final receipts link to actual devnet transactions.

The [tour publication repository](https://github.com/Reaper2403/kontor-tour) contains static assets. This repository contains the public application source.
