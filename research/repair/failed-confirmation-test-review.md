# Independent failed-confirmation transport review

Reviewer `/root/repair_test`; source-aware integration reviewer. Accepted decision KONTOR-FAILED-CONFIRMATION-01. No product writes, live RPC interaction, browser harness use/reset, Git or deployment actions performed. External test artifacts only.

## Initial review finding (parent notified)

The initial `validFailureMetadata` helper recognized any capitalized alphanumeric string as a valid transaction-error or instruction-error enum. Invented values `meta.err = "ThisIsNotASolanaError"` and `meta.err = {InstructionError:[1,"ThisIsNotASolanaError"]}` were promoted to known failed outcomes with `allowFailure:true`. Two independently added external negative cases reproduce this (both failed their required UnknownOutcome assertion). This violates the decision's malformed-metadata boundary even though exact transaction bytes were checked. Recommendation: accept the minimal required structured InstructionError/Custom uint32 variant, or explicitly enumerate known variants; unknown strings must stay unresolved. Parent triages and owns any fix.

Reproduction: `independent-failure-variants.mts` in this directory, derived from the dedicated fixture with only two additional malformed enum values and absolute relative product imports. No product files were changed.

## Other reviewed properties

- `broadcast` persists prepared identity before its one original send call. The catch invokes the private `inspectPrepared(prepared)` only; no call to signed/submit/broadcast/send exists in the fallback.
- Inspection validates canonical durable base64, SHA256, transaction serialization and cryptographic signatures, prepared signature/blockhash, exact confirmed returned transaction bytes, and a safe confirmed slot with explicit own error metadata.
- Only a typed `ChainError`, code TransactionFailed, failed confirmation, and matching prepared/evidence signatures may supply fallback evidence.
- A successful exact inspection returns normally and its value is ignored, leaving evidence unset and preserving UnknownOutcome. Missing/mismatched/unavailable inspection also preserves original signature and unknown status. This is no successful-operation recovery expansion.
- Fallback reads use existing bounded paced RPC and limited 429 read retries; one application send attempt is distinguished from optional RPC-server retries of those same signed bytes.
- Plain-object original exception receives readable generic wording rather than leaking arbitrary payload or saying undefined.

## Initial regression results

Focused independent run of client-failed-confirmation, client-rate-limit, client-inspect, recovery-engine, recovery-message, recovery-adapter and recovery-transport: **106 passed, 0 failed**. Thus the malformed-enum defect is a coverage gap rather than an existing suite failure. Log: `independent-failed-confirmation-tests.log`.

Final disposition and post-fix recheck follow below when parent triage completes.

A third external malformed case also initially failed: `InstructionError:[255,{Custom:7003}]` is accepted despite the exact transaction containing only two instructions. This is syntactically a u8 index but semantically impossible for the verified transaction. Parent was notified to constrain the instruction index to the signed transaction instruction count. Same external reproduction now includes `out-of-bounds-instruction`.

Initial typecheck passed independently.

## Final disposition — PASS after bounded fix

Parent narrowed fallback metadata acceptance to the explicit `InstructionError:[index,{Custom:uint32}]` variant, with no enum-string acceptance, and required `index < signedTx.tx.instructions.length`. Source reinspection confirms both boundaries. This conservative contract leaves all unsupported error variants unknown; it does not expand successful recovery.

Independent external repro rerun: **3 passed, 0 failed** (invented transaction enum, invented instruction enum, out-of-bounds instruction index). Log: `independent-failure-variants-result.log`.

Focused transport, identity-inspection and recovery regression rerun: **110 passed, 0 failed**. Log: `independent-failed-confirmation-tests.log`. These include real-shaped Custom7002/7003 failed evidence, send/plain-object-confirm exceptions, allowFailure, successful/mismatched/unavailable results remaining unknown, durable identity preservation and one original application send without replacement signing. Parent also added the missing malformed metadata cases to product tests.

No remaining material concern found within the accepted failed-only classification scope. This report does not claim to independently verify the separate supplemental devnet proof or the parent's full-suite count; no browser or live network was touched by this review.
