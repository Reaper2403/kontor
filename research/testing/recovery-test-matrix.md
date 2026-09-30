# Proposed independent recovery test matrix

Date: 2026-09-30. Reviewer: `/root/integration_test`. Status: **proposed before SDE contract / final PM acceptance**. No implementation or live-scenario mutation authorized by this document.

Inputs reviewed: `accountant-round3.json`, `ux-recovery-proposal.json`, `pm-recovery-triage.json` in the parent `research/kontor-build-2026-09-30` directory. The browser observed a locked revised approval. The parent's confirmed-signature diagnosis is not itself verifier authority.

## Test boundary

Use one synthetic durable pending approval after the 200 credit: actor A approving revision 2 in UI / revision 1 on chain, 800 Test USD, unpaid. Prior two 1,000 approvals remain historical. Fixtures contain independently encoded signed transaction bytes, durable intent, a transaction status/record and a program account snapshot. Change one relevant property per negative case.

Run lightweight isolated tests with fake read RPC and temporary state/journal files. A network-send/signing spy must throw if called anywhere in recovery. Do not use the live scenario or inject faults into the accountant's session. After acceptance, separately validate the real stuck scenario through the parent-owned recovery route and capture its before/after identity without issuing another transaction.

For bounded implementation, recommend recovering only the observed approval transition unless the accepted SDE contract independently specifies every credit/payment rule. Unsupported action types must remain locked; a generic state-promotion mechanism is insufficient.

## Positive and durability cases

| Case | Required observation |
|---|---|
| Exact confirmed revised approval | One current approval for the saved actor and amount; one confirmed event linked to the exact recorded signature; original history preserved; unpaid, no settlement, no balance movement; lock removed only after all checks pass. |
| Second approver variant | Existing current A approval preserved; exact successful B approval produces two distinct current approvals, still no settlement or payment evidence. |
| Repeated status checks | Same outcome and evidence identity after 2–3 checks; no extra approval/event, signature, send or signing call. |
| Concurrent status checks | One local transition; remaining callers see the same settled recovery result or a safe in-progress result. No duplicate records. |
| Restart before recovery | Load private pending intent and journal, then recover the exact existing transaction. Do not require resubmission or a pasted signature. |
| Restart after recovery | Same current approval/event/count and no pending transaction; original request retry must not resubmit. |
| Persistence failure | A failed final local save must not report durable recovery success or permit duplicate mutation after restart. Original durable intent remains sufficient to repeat reconciliation safely. |

## Identity and journal adversaries

For each rejection, retain the operation lock, before-state accounting values, prior completed evidence, and private pending intent. A last-check result/timestamp may change.

| Mutation | Why it must remain unresolved |
|---|---|
| Missing intent, missing signed bytes, missing journal, ambiguous multiple journal candidates | No exact durable operation binding. |
| Unrelated successful transaction signature with the expected approval mask already present | Generic success and a matching current state do not prove this saved action succeeded. |
| Signature does not match serialized transaction; corrupted base64/hash; invalid signature; changed blockhash/message | Journal identity is inconsistent or tampered. |
| Saved action actor differs from instruction signer or configured approver; wrong role / missing signer flag | Cannot attribute the approval to the saved authorized person. |
| Saved action type, instruction discriminator or program ID differs | A successful unrelated action is not this approval. |
| Different scenario ID, organization/config PDA, obligation or revision account; stale expected revision | Prevent cross-scenario or historical transaction adoption. |
| Wrong account writability/signer metas or extra accounts | Signed instruction must match the accepted program interface, not merely name the right program. |
| Expected approval plus extra transfer, foreign program instruction or second business instruction | Recovery must not accept a transaction with additional effects. Only the explicitly allowed compute-budget instruction(s) and exact approval instruction are permitted. |
| Changed durable expected amount, mint, recipient, credit/evidence/invoice digest | Cannot authorize adoption of different business terms through a valid signature. |
| Intent's intended-after state includes unrelated extra event, second approver, settlement or altered history | A matching approval transaction must not authorize arbitrary stored-state promotion. Reconstruct/validate the exact permitted delta. |

## Chain outcome and freshness adversaries

| RPC/account condition | Required observation |
|---|---|
| Null/unseen signature or transaction body absent | Remain locked; absence is not proof of failure or permission to retry. |
| Processed-only/unconfirmed status | Remain locked; requested confirmation threshold not established. |
| Confirmed transaction with non-null meta error | Remain locked; do not import an approval or create a successful event. |
| Status and transaction record disagree on signature, slot, failure or confirmation | Remain locked as inconsistent evidence. |
| RPC 429, timeout, transport error, malformed response | Useful last-check result, lock retained, no send; manually retryable status read only. |
| Account snapshot context precedes confirmed transaction slot | Reject stale state; use a supported minimum context slot or equivalent validated slot evidence. A successful older account read is insufficient. |
| Snapshot at sufficient slot but expected actor bit absent | Do not recover from transaction success alone. |
| Extra unexpected approval bit, advanced revision, paid state or changed financial terms | Reject ambiguous/non-exact transition under the bounded contract. Do not silently merge later state. |
| Wrong owner, size, PDA, config, mint, recipient or revision evidence | Reject substituted or malformed program state. |
| Expiry differs from intent/before state | Reject changed authorization terms. SDE must state whether elapsed wall-clock expiry after a valid historical approval is unsupported or represented explicitly; tests must follow that decision. |
| Credit/pay/reset/capture/test-previous pending action with approval-shaped evidence | Unsupported transition remains locked unless the accepted contract defines its separate proof. |

## API/evidence invariants

- A supplied signature in a request body must never select authority; recovery selects its transaction from durable private pending metadata.
- GET/current state and exported evidence keep pending context separate from completed evidence until successful exact reconciliation.
- Pending approval copy uses saved actor and amount and states that approval does not move funds. Raw identifiers remain technical details; source-aware tests verify metadata, while a separate fresh browser actor checks wording, progress and overflow.
- A reconciliation race with a new action cannot bypass the existing operation lock or apply an action to a different revision/scenario.
- Previous completed/archived evidence remains byte-equivalent apart from the one permitted new confirmed event and current approval record.

## Acceptance evidence and limits

Record accepted contract reference, exact test command and count, mismatch/failure categories, no-send spy result, restart/idempotency behavior and any remaining unsupported cases. These tests validate recovery orchestration and verification against controlled fixtures; they are not a new SBF security audit or independent devnet execution claim. The parent alone handles real read-only reconciliation and control-plane writes. Accountant review remains separate and fresh-context.
