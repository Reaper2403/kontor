# Source-aware refinement integration review

Reviewer: `/root/repair_test`, independent native Codex source-aware integration tester. Decision: KONTOR-REPAIR-UX-02 in `decision-refinement.json`. This is neither a human accountant review nor enforced blind evaluation. Parent retains control-plane ownership. No network token mutation, Git operation or live paid workspace interaction occurred.

## Result

PASS for reviewed refinement and refreshed static-tour UI. Independent final `npm test`: **145 passed, 0 failed**; `npm run typecheck`: **passed**. Added `tests/ui-reserve.test.ts` with five meaningful reserve rendering tests. Product App/Tour builds remain parent-run gates; these browser checks load current source through separate Vite harness servers, not the built distribution.

## Important finding resolved

The refreshed proof has approval object times and evidence event times differing by 1–17 ms. The initial projection joined on exact timestamp equality, dropping Mara from historical scenes and failing two existing projection tests. The reviewer reported this promptly. Parent changed the projection to match approval event prefixes by actor/name, revision and amount, consistent with one permitted approval per role per revision. Subsequent independent full-suite rerun passed. Fresh browser runs at both widths additionally asserted current approval counts **0, 1, 2, 0, 0, 1, 2, 2, 2, 2, 2** across the eleven scenes. The refreshed evidence bytes were not altered to force timestamp equality.

## Reserve clarity and precision

Five automated rendering cases passed: known fractional balance with conditional separate return, null balance staying unknown, underfunding without negative predicted return, unresolved-operation last-confirmed balance without preview, and exactly funded zero remainder without a claimed treasury transfer.

Eight browser cases (four states at each of 1440×1000 and 390×1000) passed using page-local read-only state fixtures:

- Actual balance 1,000.000001 and amount due 800 display conditional remainder 200.000001; wording says what would remain after successful supplier payment.
- Null shows **Not recorded**, with no inferred reserve or remainder.
- 799.999999 explicitly says reserve insufficient for 800; no negative return preview.
- Unknown approval operation labels reserve **Last confirmed**, keeps six decimals and suppresses prediction until resolved.
- Rehearsal describes simulated funding; no receipt or network issuance is fabricated. No horizontal overflow.

Source inspection also confirms devnet wording explicitly describes generic synthetic setup rather than asserting a funding receipt for the displayed snapshot.

Artifacts: `browser-reserve.mjs`, `browser-reserve-results.json`, `reserve-{known,unknown,underfunded,pending}-{1440,390}.png`.

## Evidence shortcuts

Browser checks activated **View complete evidence**, **View payment evidence**, and **View recorded evidence** using keyboard Enter. The latter two were repeated after Evidence was already active, with scrolling away between activations. Every activation focused the visible `From invoice to payment.` heading and scrolled it to approximately 28 px from the viewport top at both widths. The focus outline was visually inspected at 390 px. Tests used reduced-motion preference and observed instant scrolling; no motion dependency or hidden heading.

Live-app visual cases used page-local intercepted GET state containing the real exported v2 snapshot. No action was posted. This avoids mutating the shared rehearsal or any chain state.

Artifacts: `browser-refinement.mjs`, `browser-refinement-results.json`, `refinement-evidence-{1440,390}.png`, `refinement-tour-evidence-{1440,390}.png`.

## Full refreshed static tour

All eleven scenes were traversed by keyboard at desktop and mobile. Every scene had the expected current approval count; historical pre-payment reserve remained unknown rather than borrowing a later balance. Chapter five opened without a modal. Explicit payment inspection and Escape focus restoration still passed.

The paid scene displays **800 paid, 200 still reserved**, with vault balance 200 and no treasury receipt. The next, separate treasury-return scene displays a 200 return and vault zero; the final evidence retains those same distinct outcomes. The treasury Explorer link matches `state.treasuryReturn.signature` and differs from `state.settlement.signature`. The expected remaining reserve is sourced from the payment transaction's recorded post-token balance in the projection, not inferred from credit. All displayed proof assertions here were checked against the local committed v2 export; this review did not independently fetch the chain.

Tour requests were strictly local GET requests: no `/api/` calls, non-GET requests, external RPC requests, or runtime errors. No tour return/payment mutation button appeared. No horizontal overflow at either width.

## Harness handoff

Dedicated fresh rehearsal UI **5178**, memory-only API **4317**, static source preview **5180**. Current harness process PID **88319**, execution session **45413**. No mutation was made to shared rehearsal state during this refinement review; it remains fresh for the parent’s subsequent AI persona review. All browser fixtures, reports and screenshots stay outside the product under `.kontor-process-work/repair/`.
