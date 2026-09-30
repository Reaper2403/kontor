# Independent integration acceptance plan

Owner: native Codex `/root/integration_test`, source-aware. Decision: `KONTOR-BUILD-20260930`. This report does not constitute blind accountant review or compiled Solana program verification.

## Service and persistence boundary

- A duplicate approval by one persona cannot make an invoice payable. Reviewer/executor cannot approve; approvers/executor cannot revise credits.
- Expected revision binds approve, credit and pay. Wrong revision rejects without changing balances, approvals, credit or settlement.
- Original 1,000 minus one accepted 200 credit leaves 800. The credit invalidates both prior approvals; old signed execution must fail. Identical retry cannot apply another credit, including across restart.
- Revise-first: old execution fails; fresh distinct approvals settle exactly 800. Execute-first: settlement is final; subsequent credit and payment reject, including with a new idempotency key.
- Concurrent submissions serialize. Payment retry, repeated submit and restart preserve one settlement identity. Unknown chain outcome is retained and cannot silently trigger a second transfer.
- Reset creates a fresh obligation and retains prior evidence. Public state and evidence contain no private signing keys. Rehearsal has no invented transaction hash or explorer claims.
- Invalid values, actors, action types, references and revisions receive deterministic safe errors without partial mutation. Idempotency keys cannot silently authorize a different payload.

## Real program boundary (source review, then parent-owned compiled SBF gate)

- Two configured distinct signers approve exact revision, amount, mint, recipient, evidence and expiry.
- Credit signer, canonical PDA, account owner/size/alias checks; repeated credit digest; stale revision; expiry; amount; vault/mint/recipient/token-program substitution.
- Writable obligation serializes credit and execution in both orderings; paid status has no reset path.
- Fixed SPL Token CPI and paid mutation roll back together on failed CPI.
- Stale live proof uses byte-identical signed transaction, successful pre-credit simulation, valid blockhash/expiry, confirmed StaleRevision logs, and unchanged vault/recipient balances.
- Parent must record binary/source provenance, actual deployed program/mint/obligation, confirmation and both token balance deltas. JS/model tests cannot satisfy these checks.

## Reporting

Record exact commands and pass/fail counts, source findings, remediation and rerun results. Mark unexecuted compiled or live gates explicitly. Do not infer network proof from local model or UI success.
