# Kontor build: independent SDE assessment

Actor: `/root/build_sde`. Date: 2026-09-30. Independent first assessment; sibling assessments not read. Parent is the sole HackFleet control-plane writer. This file is advisory research, not an accepted decision or execution receipt.

## Recommendation and feasibility

The protected-program control is implementable as a small Solana program and a polished TypeScript web app. A JavaScript state machine alone cannot satisfy the claim. Preserve the frozen decision's canonical obligation, append-only revision and approval records, permanent paid bit, exact transfer binding and program-owned token vault. Use actual compiled SBF and actual SPL token CPI for acceptance.

Proceed with bounded remote compilation/test infrastructure, then devnet deployment and both ordering rehearsals. Operational feasibility remains conditional on three external gates: downloadable compatible toolchain, sufficient devnet SOL, and sufficient official devnet USDC. A failed gate does not authorize relabeling simulated evidence as live proof. Native Codex builders plus HackFleet canonical tasks and remote deterministic verification are available in principle, but must be described as that hybrid workflow: the hosted coding worker is not being executed without its required provider key.

There is a material funding conflict to resolve before promising the exact scene. Circle documents 20 test USDC per two hours/address/blockchain. The requested 1,000-unit scene needs at least 1,000 official test USDC for one vault, and 1,800 for both ordering scenarios without reusing received funds. The prior approved design says fixed USDC mint. Do not silently substitute a self-created mint or show 1,000 while moving 10/20 units. If an existing sufficient balance is unavailable, PM should explicitly accept either a clearly named custom **Kontor test USD** mint for the exact-amount demonstration, or a delayed official-USDC rehearsal. Creating many faucet addresses to work around limits is not a recommended route. The custom-mint path preserves the authorization control but changes the currency claim.

## Observed environment

Read-only probes found Node `v26.10.0`, pnpm `11.19.0`, macOS arm64 and roughly 29 GiB free. No Rust, cargo, Anchor, Solana CLI, cargo-build-sbf or validator appeared on PATH or conventional local installation directories. Docker CLI is installed, but its daemon socket is absent. A read-only `getHealth` request to the public devnet RPC returned `ok`.

No installation, code, build, wallet, transaction, infrastructure or control-plane mutation was performed by this actor. Only this assessment was written. Parent separately reports an authenticated GitHub account and available current HackFleet worker bundles; those are parent-provided facts, not my independent credential inspection.

## Stack and execution route

1. Use React, TypeScript and Vite with ordinary CSS/design tokens for the web preview. Keep components small; avoid authentication infrastructure, a database, an indexer, invoice OCR, account-provider integration or generalized treasury operations. The focused demo can read program accounts and a bounded transaction/evidence manifest.
2. Prefer a small Anchor program for declarative account ownership/PDA/signature constraints and explicit business errors. Pin the entire Rust/SBF/Anchor matrix; current official docs show Anchor 1.2.0 and Solana CLI 4.1.2 examples, but those example versions still need a compatibility build. Do not combine unpinned latest crates with a cached old SBF compiler. The current Anchor TypeScript package is `@anchor-lang/core`, and its documented client compatibility is web3.js v1, not v2. Pin compatible dependencies and lockfiles.
3. Install a pinned official prebuilt Solana/Agave Linux toolchain on a disposable GitHub Ubuntu runner, then build one program with `cargo build-sbf`. Avoid compiling an Anchor CLI from source if a vetted matching prebuilt release is available. If Anchor CLI installation exceeds the bounded job, `cargo build-sbf` can build Anchor program source; a checked-in explicit client schema/codec must then receive byte-level instruction/account round-trip tests. Native Rust without Anchor is a fallback only after review, because manual owner/PDA/data-size checks add risk.
4. Test pure arithmetic/state transitions cheaply, then run the actual compiled SBF in LiteSVM or a validator with SPL Token. Prefer one integration harness rather than compiling multiple emulator stacks. A local model test is supplementary, never evidence that account constraints or CPI ran correctly. Keep all heavy compilation remote.
5. Deploy only to devnet using a task-specific ephemeral test wallet and explicit cluster parameters. Never change the user's default wallet/cluster or reuse an unidentified existing key. Devnet deployment size determines rent; calculate actual compiled size and required balances before dispatch. No purchases of SOL/USDC are needed or appropriate.
6. Keep build artifact delivery distinct from HackFleet's deterministic receipt. That worker allows a single small `receipt.json`, discards command output and does not deliver `.so`, browser bundles or transaction logs. A separate reviewed workflow/artifact channel can carry the compiled binary, source SHA, toolchain versions, hash, public deployment manifest and evidence JSON. The controller verifies that artifact against the exact accepted source/build and independently rereads confirmed chain state. Do not expand or bypass HackFleet ingestion to pretend a richer artifact passed its existing schema.

## Program boundary

- Immutable organization configuration names registrar, credit reviewer and exactly two distinct approvers. For the demo, omit configuration/authority mutation instructions entirely. Document the upgrade authority as trusted; a retained upgrade key can replace enforcement, so this is not trustless custody.
- Obligation PDA derives from organization and registrar-assigned immutable ID, never a clerk-selected display label. Original invoice amount/digest and destination are immutable. Registrar trust covers real-world uniqueness; the program does not authenticate invoices.
- Credit/revision PDA derives from obligation and monotonically increasing revision. Reviewer signs a revision that checks expected current revision and unpaid status, records credit/evidence/reason commitment, and increments revision atomically. Use checked integer arithmetic in six-decimal units; reject zero, over-credit, overflow and duplicate/old revision creation.
- Per-approver revision-specific approval records bind organization, obligation, current revision, total evidence digest, amount, fixed mint, exact recipient token account and owner, and expiry. Duplicate approver keys are disallowed. Approvals have no wildcard or inheritance between revisions. Keep old records available as history instead of replacing them destructively.
- Vault is a canonical SPL Token account with a PDA authority controlled solely by this program. Validate token program identity, mint, vault authority, recipient token account and owner. Omit withdrawal, delegation, authority reassignment, arbitrary CPI, reset and close/reinitialize paths. Reject remaining accounts or use none.
- Execute checks unpaid and expected revision first, then exact approved state and two unexpired approvals, sets paid and performs fixed-token transfer CPI atomically. Failed CPI must roll back paid state. Execution and revision both require the same writable obligation, which serializes the race. Replay with a new blockhash must still reject a paid obligation.
- For the stale proof specifically, do not erase old approvals or change destination before rejection: keep the old transaction otherwise valid, and make the business revision mismatch the logged failure. Signature, fee payer, blockhash, expiry and sufficient vault balance must all remain valid.

## Devnet proof protocol

Revision-first: register 1,000, collect two approvals, construct/sign the exact old execute transaction with a fresh blockhash, retain serialized bytes/hash and signature locally, and simulate those bytes successfully before revision. Confirm the authorized 200 credit transaction. Immediately verify old blockhash validity and approval expiry, then use a separate executor process to submit the **same bytes** with `skipPreflight: true`. Require a confirmed transaction containing the intended stale-revision program error; a send signature or preflight simulation error is insufficient. Record `getTransaction` logs, slot, error, block time and pre/post token balances, and independently reread vault/recipient balances. Expected movement is zero test USDC; SOL fees may be charged.

Then collect two new approvals for 800, execute once, reconcile exact amount and destination, and attempt duplicate execution under a fresh transaction signature to prove the permanent paid guard rather than RPC duplicate-signature suppression.

Execution-first: create a separate obligation, approve 1,000, execute and confirm, then submit authorized 200 revision and require AlreadyPaid rejection. No 800 payout, no revision reopening, no recall claim. Reusing program-controlled funds must never require adding an unrestricted vault withdrawal instruction.

The public RPC's `sendTransaction` success only acknowledges submission. Persist confirmed/finalized transaction evidence, source program ID, deployment binary hash, cluster identity, mint and public account addresses. Export synthetic original invoice, credit, actor/reason, both approval sets, rejected attempt and settlement together. Mark pending, failed, recorded and confirmed statuses honestly in UI.

## Required tests and review

Remote SBF integration tests must cover: both serialized orderings; approval reset by new revision; duplicate approver; unauthorized registrar/reviewer/approver; wrong organization/PDA; account substitution; wrong mint/token program/destination owner; expired approval; changed amount/evidence; credit underflow/overflow; duplicate credit; duplicate execution; failed CPI rollback; paid-state reinitialization/close bypass; and raw SPL transfer/delegate inability from the vault without the PDA. The malicious test client should form instructions directly, independent of UI validation.

A source-aware integration reviewer should inspect every instruction/account constraint and evidence chain. A fresh genuinely isolated browser evaluator is still required by the HackFleet skill; a no-history native agent with repository access is not genuine isolation. Its unavailability pauses that evaluation gate, but does not turn non-blind testing into blind evidence.

UI engineering must expose an intelligible stage model, preserve original 1,000 alongside accepted credit 200 and due 800, distinguish the reviewer from payment approvers, clearly show superseded authorizations and pending confirmations, and offer a concise evidence drawer. Program logs/addresses belong in expandable evidence, not the main workflow. Keyboard focus, contrast, narrow-screen layout and loading/error recovery deserve acceptance checks alongside chain correctness.

## Budget and stop conditions

Use standard Linux two-core runners with 60-minute hard timeouts and no build matrix. GitHub currently lists $0.006/minute; four full jobs are a conservative $1.44 compute estimate before included quota and storage, not a provider-enforced cap. Parent owns the shared $10 budget, including all agents/workflows and browser evaluation. Reserve only a small explicit compute envelope initially; do not let a missing toolchain trigger unbounded retries. Prefer zero-cost local static serving for the preview or an already authorized free host, rather than buying infrastructure.

Stop/escalate a stage when toolchain pins cannot compile in the bounded attempts, faucet/rent funds are unavailable, no supported channel can preserve build/evidence provenance, stale transaction expires before the intended rejection, an unexplained token balance changes, a paid-state bypass appears, or the shared expense reserve approaches $10. Expired blockhash runs may be rehearsed again on a new obligation within bounds but cannot count as stale-revision proof. An emulator-only result is an honest intermediate deliverable if devnet is unavailable; it does not complete the promised devnet outcome.

## Primary references

- [Anchor installation](https://www.anchor-lang.com/docs/installation), [TypeScript client compatibility](https://www.anchor-lang.com/docs/clients/typescript).
- [Solana program deployment and rent](https://solana.com/docs/programs/deploying).
- [sendTransaction semantics](https://solana.com/docs/rpc/http/sendtransaction), [isBlockhashValid](https://solana.com/docs/rpc/http/isblockhashvalid), [public RPC limits](https://solana.com/docs/references/clusters).
- [Circle mint list](https://developers.circle.com/stablecoins/usdc-contract-addresses): official Solana devnet mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`; [test faucet](https://faucet.circle.com/?allow=true): 20 USDC per two hours.
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
- Installed HackFleet `workers/deterministic/README.md`, `workers/coding/README.md`, `apps/orchestrator/NEGOTIATION.md`, and `packages/protocol/src/proposal.ts` were read for the actual execution/schema boundaries.
