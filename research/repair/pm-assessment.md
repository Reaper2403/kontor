# Independent PM assessment — repair scope

Author: actual Codex agent `/root/repair_pm`. Source-aware product assessment, 2026-09-30. No implementation, Git mutations, deployment or cloud actions. This is provisional input pending UX → PM → SDE → PM review, not an accepted protocol decision.

## Product conclusion

Prioritize correctness of the payable boundary and truthfulness of the public handoff. Accept the requested paid-only remainder release and recipient binding per obligation, subject to engineering feasibility and adversarial compiled-program checks. Keep the existing 1,000 → 200 credit → 800 settlement story intact and keep historical receipts visibly historical.

## Observed facts

- `programs/kontor/src/lib.rs` supports configuration, obligation creation, approval, one partial credit and payment. No invoice cancellation instruction or cancelled state exists. `current` rejects already-paid obligations; credit must be positive and strictly less than amount due. Thus a full credit/cancellation is unsupported. UI Cancel dismisses a dialog and is not invoice cancellation.
- Config currently stores recipient and recipient owner globally; each obligation records vault but no recipient. Payment validates against that global destination. This technically enforces a fixed configuration recipient, but prevents different suppliers under one config.
- Vault funding is original amount and payment transfers the reduced due amount. There is no current withdrawal/remainder release; the credit portion remains in the vault after settlement.
- README still claims the source repository is private and links process research paths. Parent reports current repository visibility verified public. Historical process memory contains the previous privacy assumptions and must not be passed off as current.
- App uses Northstar Studio/Berlin as client and Northform Studio as supplier, an unnecessarily similar pair. Rename only synthetic client display and location to a distinct GmbH/Hamburg identity; do not rewrite historical chain identity or receipt bytes.
- Existing provenance refers to accountant agents/reviewers and says tool isolation is instructional. Public wording should explicitly say AI accountant-persona reviews and no human accountant or security audit.

## Proposed product constraints

1. `release_remainder` is treasury-authorized and works only after the obligation is paid. Destination must be immutable or otherwise canonically treasury-bound, not caller-selected. Releasing must not change amount paid, paid status, revision, recipient, or approvals. Empty repeated release must fail or be explicitly idempotent without fabricating a second settlement. It must never reopen payment.
2. Do not add invoice cancellation in this repair. State explicitly that unpaid/cancelled invoice withdrawal and full cancellation are unsupported. A paid-only remainder operation does not solve funds locked in unpaid or cancelled invoices. Do not claim it does.
3. Snapshot recipient token account and owner into each new obligation. Approval/payment semantics remain tied to the obligation, so after approval the destination cannot be swapped. Test two obligations with distinct recipients under one config and reject cross-recipient payment.
4. Define compatibility/versioning before updating account layouts. Existing receipts and public tour remain evidence of the older deployed program, not proof of new release behavior. If new code is deployed, record a new program/build version and fresh exact evidence separately; never overwrite old proof files to imply continuity.
5. Product branch contains application source, ordinary build/test documentation, and curated product/chain evidence as needed. HackFleet process records, logs, research, memory, tasks and execution provenance move to a dedicated process branch. This is separation, not sensitive-data erasure from history. Keep links working through branch-qualified URLs and retain useful provenance without importing the fleet into product setup.
6. Public README must be accurate about current visibility. Legitimate phrases such as private signing keys remain accurate and should not be mechanically removed. Replace the human-review ambiguity with an explicit AI review description; no new accountant validation or production readiness claim.
7. Rename client consistently in workspace and invoice billed-to context, preserve supplier identity, use Hamburg, Germany, and choose an obviously synthetic distinct GmbH. Product readability matters more than adding a new domain model.
8. Tour payment-review step must offer an obvious reachable way to continue at desktop and phone widths, with keyboard access. The modal's own existing result button can satisfy this; avoid concurrent hidden next controls implying an extra action.

## Acceptance evidence

- Compiled program tests: treasury authorized after-paid release returns precisely the remaining balance; unauthorized actor, unpaid obligation, arbitrary destination, mismatched vault/mint, aliased accounts and replay cannot drain or alter the obligation. Overfunded vault policy is stated and tested.
- Compiled program tests: two recipients per config; approval/payment remains tied to each immutable recipient; recipient owner/mint/account substitution rejected. Existing stale revision, duplicate payment and credit-after-payment checks still pass.
- Client/service tests and build cover the new layouts/addresses and prevent stale manifest confusion. Required formatting passes.
- README/product-tree inspection confirms accurate visibility, explicit AI review labels, process branch navigation and no unsupported cancellation claim.
- Source-aware browser check verifies distinct client identity and accessible modal progression at desktop/phone. Any fresh persona review is labeled AI and instructionally isolated if isolation is not enforced.

## Rejected scope

No cancellation flow, invoice extraction, custody hardening, mainnet, human-accountant certification, new hosted backend or broad UI redesign. No rewriting historical evidence to match a new binary. No claim that moving process files between branches makes prior public history private.
