# Kontor v2 source-aware integration review

Reviewer: native Codex agent `/root/repair_test`, scoped by parent `/root`; independent source-aware test author, not a blind evaluator or human accountant. Date: 2026-09-30. Accepted scope: `decision-record.json` (KONTOR-REPAIR-01). Parent remains sole control-plane writer. No Git mutation, deployment, live devnet call, or existing port 5173 interaction was performed by this reviewer.

## Findings and disposition

1. **Saved network binding gap identified, fixed and regression-tested.** Initial `adapter.link` rejected a changed saved recipient/obligation but could replace saved program, vault, treasury or asset mint with current manifest/network values. Parent added explicit comparisons for existing linked state. Five independent adapter tests now reject recipient/program/vault/treasury/mint substitution. This is a source integrity check; no exploit or live mutation was attempted.
2. **Supplier settlement signature stays separate from return signature.** Direct source inspection and RPC-mocked adapter assertions confirm only the payment action assigns `settlement.signature`. Return uses `treasuryReturn.signature` and its own evidence event. All successful and failed/unknown paths leave the supplier settlement structurally unchanged.
3. **No unsupported recovery success.** Failed return restores the paid state with no return receipt. Lost send response and confirmed transaction with missing required release log retain an unresolved operation, keep confirmed supplier payment, add no successful return evidence, and expose `recoverySupported: false`. Explicit reconcile leaves the operation locked and does not resubmit.
4. **Actual balance is tested independently of credit/local estimate.** Adapter test starts with stale local reserve 200 and transaction-proven actual return 250, plus zero and one atomic token unit. Return amount comes from the successful program invocation log, not credit or stale local state. Engine tests also cover 625 remainder after overfunding, 250 with no credit, zero, repeated empty return, and later one-unit dust sweep.
5. **No unresolved blocking defect found in reviewed source/UI scope.** Compiled SBF execution and fresh devnet transaction proof are parent/SDE gates and are not claimed by this report. Static-tour screenshots here precede any fresh v2 proof refresh, so they verify interaction and explicit historical replay behavior, not the final refreshed proof contents.

## New committed-scope tests

- `tests/release-engine.test.ts`: 8 tests. Pre-payment rejection; three wrong app roles; actual balance cases; immutable payment/approvals/recipient through return; idempotent duplicate request across restart; empty repeat and later dust; paid replay rejection; definite failure and unknown durable lock across restart; no fake rehearsal signatures.
- `tests/release-adapter.test.ts`: 11 tests. Three proven amounts (0, 1 atomic unit, 250 Test USD); definite failed, lost send response, and missing-log outcomes; five saved-binding substitutions.
- Independent combined test run: **139 passed, 0 failed** (`npm test`). Includes existing stale-payment, duplicate-payment, two-person approval, recovery message/intent/transport and tour rendering regressions. New focused run: **19 passed, 0 failed**.
- These tests use temporary local files and mocked Solana RPC methods, with original methods restored after every test. They are not network transfer proof.

## Source invariants reviewed

`programs/kontor/src/lib.rs` tag 5 checks a signed caller, v2 config/obligation, paid obligation, configured mint, fixed treasury account and original owner, exact canonical vault account/obligation owner/mint, no vault delegate/close authority, initialized token state, and SPL Token executable account. These checks run before the zero-balance branch. Only actual `v.amount` moves. The obligation is read-only and never rewrites payment, revision, amount, recipient or approvals. A later dust sweep is possible. Tag 4 now checks the obligation's recipient/owner rather than a global supplier destination. Old config/obligation discriminators and exact lengths are rejected. This is source inspection; compiled-program adversarial results must corroborate it.

`chain/client.mjs` reads v2 layouts, validates immutable per-obligation recipient and configured treasury, scopes the returned amount to one successful top-level invocation of the configured program, and refreshes program accounts at minimum confirmed transaction slot. `server/devnet.ts` preserves distinct settlement/return receipts and unresolved-operation semantics.

## Browser evidence

A dedicated memory-only REHEARSAL harness imported the production Engine/App and served UI on `127.0.0.1:5178`, API on `4317`; no devnet adapter was configured. A separate static-tour development server ran on `5180`. Harness code and all screenshots/results remain outside the product under `.kontor-process-work/repair/`. This harness does not test production HTTP origin middleware; it tests production Engine and UI behavior.

Playwright with installed Google Chrome, viewports **1440×1000 and 390×1000**:

- Full UI workflow: original two approvals → credit 200 → earlier instruction check with zero movement → fresh two approvals → 800 rehearsal payment → wrong-role return disabled → operator returns 200 → vault zero. Supplier settlement unchanged. Payment and return separately visible. Rehearsal labeling and null signatures preserved.
- No document horizontal overflow at either width; no browser runtime errors. Screenshots visually inspected for desktop/mobile layout.
- Static tour chapter five starts without a modal. Keyboard Enter opens explicit inspection. Both Escape and keyboard Close restore focus to the inspection trigger. Keyboard progression reaches paid result and evidence. No API or non-GET request occurred in tour checks.
- Results: `browser-check-results.json`; screenshots `rehearsal-return-{1440,390}.png`, `tour-evidence-{1440,390}.png`.
- The rehearsal was reset to a fresh unpaid state after testing and handed to parent for an independently conducted review. Reviewer did not claim enforced blind isolation.

Additional isolated browser state fixture checks at both widths (`browser-unknown-results.json`, `unknown-return-{1440,390}.png`) verify that a synthetic unknown treasury-return state still displays **Payment confirmed**, distinctly says the treasury return awaits confirmation, hides repeat-return and unsupported recovery controls, and disables role/reset changes. API responses were intercepted only inside those browser pages; the shared rehearsal server was not mutated. This is UI state handling evidence, not a network transaction.
