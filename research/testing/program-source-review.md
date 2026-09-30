# Independent program source review

Reviewer: native Codex `/root/integration_test`, 2026-09-30. Reviewed `programs/kontor/src/lib.rs`; source-aware review only. No SBF compilation, runtime transaction or devnet claim follows from this review.

## Observed controls

- Configuration, obligation and revision require program ownership, exact serialized sizes, magic values and canonical PDA seeds. Calculated Borsh lengths agree with constants: 232, 129 and 217 bytes.
- All instruction accounts are unique. Creation requires signer/payer, correct executable system/token programs and empty destination accounts.
- Configuration requires distinct nonzero approver A and B. Approval records one signer-specific bit and rejects duplicate approvals. Both approval and execution enforce revision expiry.
- Amount, evidence digest, credit digest, reason digest and expiry live in immutable revision state; mint, recipient and recipient owner live in immutable configuration. No instruction edits configuration or an existing revision's financial terms.
- Credit requires configured reviewer, exact current unpaid obligation and existing canonical revision. One credit maximum prevents credit replay through another revision. New revision starts with no approvals.
- Execution checks paid/revision before revision-account validation, allowing unchanged original execution bytes to produce the required business-level `StaleRevision` error.
- Execution validates mint, exact recipient and owner, canonical vault, token owner/mint, no delegate/close authority and initialized vault. SPL Token program is fixed and executable; transfer amount is derived from approved revision state.
- Paid flag is written before fixed `transfer_checked` CPI. The error is propagated. Atomic rollback is expected from Solana transaction semantics, but must be executed in the compiled runtime to establish this gate.
- No close, withdraw, paid reset, arbitrary CPI or config mutation path was found.

## Explicit authorization boundary

Execution is permissionless after approval: any signer may trigger the exact approved payment and pay its transaction fee. The service's demo executor persona is not an on-chain executor allowlist. SDE explicitly confirmed this is deliberate; it does not grant authority to change amount, mint or destination. Reviewer and two approvers remain configured identities. The source does not require reviewer identity to differ from an approver; the accepted requirement is two distinct approvers, not complete separation of every demo role.

## Still required from compiled runtime

Independent negative transactions should exercise substituted organization/obligation/revision, owner/size/alias errors, missing or wrong signer, duplicate approver, stale revision, expired approval, wrong vault/mint/recipient/token-program, insufficient/frozen token transfer rollback, both credit/execute orderings and paid replay with a different signature. A source inspection cannot prove any of these runtime outcomes. Parent owns compilation and remote execution.
