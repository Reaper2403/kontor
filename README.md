# Kontor

A payable workbench that keeps approval tied to the amount being paid. Built for the Build at WHU hackathon.

## The demonstration

1. Open the Northform Studio invoice for **1,000 Test USD**.
2. Switch between Mara and Jonas using **Demo role** and record both approvals.
3. As Lena, apply the supplied **200 Test USD** credit. The amount becomes **800**, and the earlier approvals expire.
4. As Alex, test the previous instruction promptly. The actual Solana program rejects the unchanged signed instruction; no Test USD moves.
5. Obtain two fresh approvals and pay **800**. Open Evidence and export the complete JSON record.

The earlier signed instruction uses a recent Solana blockhash. If you leave the demonstration paused for several minutes, it can expire. Reset the demonstration to create a new payable and repeat. Reset preserves the prior scenario in the local archive.

## Run locally

Node.js22 or later. In this directory:

```sh
npm ci
npm run server
```

In another terminal:

```sh
npm run dev
```

Open http://127.0.0.1:5173. With no network configuration, the app clearly identifies a **local rehearsal**, generates no transaction links, and moves no network tokens.

For the already configured local devnet workspace, start the server with:

```sh
KONTOR_DEVNET_MANIFEST="$PWD/.local/devnet.json" npm run server
```

Private demonstration keys are held only in excluded `.local/` files. Other machines must deploy/setup their own keys and manifest following [chain/BUILD.md](chain/BUILD.md). No keys are shipped in this repository.

## Verified behavior

The program is deployed on **Solana devnet** at [8ZgASzPtuNQote1grs4TsPATVqdkCnjZnYTkzTiBUgE9](https://explorer.solana.com/address/8ZgASzPtuNQote1grs4TsPATVqdkCnjZnYTkzTiBUgE9?cluster=devnet).

[evidence/devnet-summary.json](evidence/devnet-summary.json) links the actual transactions. [evidence/devnet-ordering-proof.json](evidence/devnet-ordering-proof.json) contains transaction logs and before/after token balances for both orderings: correction first blocks the obsolete payment; payment first prevents a late credit from reopening the obligation. It also demonstrates duplicate-payment rejection.

Run service/client tests with `npm test`, and the UI/typecheck with `npm run build`. The separate compiled-program proof workflow executes the Rust binary on a disposable Solana validator. Localnet proof, devnet proof and browser usability review are distinct evidence.

## Scope and limits

- Custom **Test USD** is a synthetic token with no monetary value. It is not Circle USDC.
- The protected boundary is a program-controlled payable and its vault. External wallets and other payment rails are outside that boundary.
- Role switching uses server-held demonstration keys. This is not production authentication or custody. A trusted program upgrade authority remains.
- This prototype supports one credit per payable, whole display units, one synthetic invoice, and JSON evidence export. It does not implement invoice extraction, DATEV integration, ramps, swaps or certified accounting treatment.
- Unknown network outcomes block further actions. For an approval with a durable saved transaction, **Check status** verifies the exact confirmed bytes, actor, invoice revision and resulting state, then records that approval once without resending it. Uncertain payments, credits, resets and control-check attempts require operator assistance; the app does not retry or unlock them automatically. `scripts/chain-reconcile.mjs` provides read-only investigation.
- The program has not been independently security audited.

## Fleet and review provenance

Independent PM, UX, engineering and integration agents contributed through HackFleet. Decisions and tasks are canonical GitHub issues; [research/build](research/build) preserves the actual submissions. Accountant agents use fresh contexts and browser-only instructions under the user's approved boundary; the runtime does not enforce filesystem isolation.

## Public guided tour

The separate guided tour reuses the workbench UI with read-only historical snapshots. It sends no transactions and needs no wallet or backend. Six chapters show original approvals, the credit, obsolete-instruction rejection, fresh approvals, payment review and the recorded receipt. Each approval is shown separately.

Build with `npm run build:tour`. Only the audited `dist-tour/` directory is intended for public hosting; never publish this private source tree or `.local/`. The reviewed evidence uses one recorded scenario and labels its reconstructed intermediate screens. Existing live app commands remain unchanged.

Tour research, independent review and publication provenance are retained in `research/tour/`. The public site is published separately from the private application repository.
