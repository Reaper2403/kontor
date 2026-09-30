# Independent PM assessment: Kontor initial build

Actor: /root/build_pm. Date: 2026-09-30. Status: independent first assessment, provisional pending UX → PM → SDE → PM decision. Inputs: delegated frozen brief, target AGENTS.md, HackFleet operating skill and installation guide. No sibling findings or source were read. No control-plane actions taken.

## Outcome and priority

The MVP should let a team prove that a contractor payment reflects the invoice amount currently authorized by two people, even when an accepted credit changes that amount after approval. The central product outcome is prevention of a stale payment instruction, followed by a clearly evidenced, exactly-once settlement of the replacement instruction. A polished invoice and payment workspace must make that causal chain understandable to an accountant without requiring knowledge of Solana or the implementation.

The fixed demonstration starts at an invoice for 1,000 USDC with two approvals, accepts a 200 USDC credit, invalidates the old authorization, rejects the stale 1,000 USDC payment instruction, obtains fresh approvals for 800 USDC and settles that replacement once. Amounts and status changes must be visible and consistent throughout. A second attempt at the same replacement must have no additional financial effect and must return the original settlement evidence or an intelligible already-settled result.

## Implementation requirements

1. A usable invoice workspace: identifiable contractor, invoice reference, original amount, accepted credits, payable amount, current review/approval/payment state, and history. One coherent synthetic scenario is sufficient; list and detail views must not imply unsupported production functionality.
2. Two distinct approver identities and visible first/second approval state. Role-switching is acceptable in a labeled demo, but two clicks from the same identity must not meet the two-person rule.
3. Accepting a credit must atomically create a revised payable version and invalidate earlier approvals/instructions. Credits cannot silently inherit authorization. Approval must bind to the exact version, amount, asset and payee/destination being authorized.
4. A stale instruction attempt must visibly fail without settlement; explain the obsolete amount/version and the next valid action. Preserve the old record as evidence rather than erasing it.
5. Replacement approval must require both identities again and show 800 USDC consistently before payment. The credit should be applied once even if the request repeats.
6. Payment completion must be durable and idempotent. A duplicate attempt or refreshed/retried request must not produce a second settlement. Failure or pending state must never display as paid.
7. Evidence must connect invoice, credit, old and new approvals, rejected instruction and accepted settlement. A real network signature/explorer link is evidence only if it actually exists and corresponds to the payment. Simulated evidence must say simulated. Clearly identify test funds/network.
8. UI quality is an acceptance dimension: clear primary action, understandable status hierarchy, approachable accounting language, amount reconciliation, readable history and useful feedback on every supported operation. Keyboard and basic narrow-screen usability should not be deferred as cosmetic polish.
9. Demo reset must have explicit synthetic/test scope and must not imply recall of a settled transfer. No real funds or production credentials are required.

## Acceptance scenarios

- Accountant can find the example invoice and explain original, credit and current payable amounts from the UI.
- Approver A alone cannot authorize payment. A repeated A approval does not satisfy B.
- With A+B approval for version 1 / 1,000, accepting credit 200 yields version 2 / 800 with zero current approvals and retains superseded evidence.
- Submitting the saved version 1 instruction returns a specific stale-authorization outcome and leaves settlement count at zero.
- One approval of version 2 remains insufficient; two distinct approvals authorize exactly 800 to the intended recipient.
- Payment completes only after valid current authorization. A repeated submit returns the same settlement identity or already-paid result; refresh preserves final status.
- The activity/evidence view reconciles all operations and demonstrates why only 800 was paid once.
- Unsuccessful requests preserve a usable UI and show actionable recovery. Test/simulation labeling remains visible at the point of payment and evidence.

## Scope boundaries and tradeoffs

Prioritize one credible end-to-end contractor invoice over broad feature coverage. Omit accounting integrations, production compliance promises, generalized multi-currency FX, contractor onboarding/KYC, payment recall, reporting dashboards without underlying data, and claims of customers or traction. CSV export or downloadable evidence is optional only after the core path and visual coherence pass. A public preview is useful, but production readiness is not an MVP claim.

The $10 additional-expense ceiling is a hard authorization boundary, not an engineering estimate; existing usage and provider-enforced limits need operator accounting. At most two post-build improvement cycles are authorized. Blind accountant browser evaluation and source-aware integration testing serve different purposes; neither substitutes for the other. A simulated settlement can demonstrate workflow but cannot meet an implied real test-network settlement claim; the decision must explicitly identify which proof is being built.

## Hypotheses requiring evaluation, not implementation facts

- Accountants see accepted-credit invalidation as a meaningful pain point rather than an edge case.
- A visible amount/version comparison is enough to explain why fresh approval is necessary.
- The targeted payer values native USDC settlement with an auditable authorization chain.
- A compact, focused invoice workspace gives a stronger hackathon demonstration than a broad finance dashboard.

These are product judgments to test in browser use and later customer research. They are not claims of validated demand, accountant acceptance, or established traction.

## Questions for negotiation

UX: How will the accountant discover and understand the stale-instruction rejection without a scripted walkthrough? How will superseded approvals remain visible without looking currently valid?

SDE: Can the implementation enforce distinct approvers, current-version authorization, atomic credit invalidation and durable idempotency at the authoritative boundary? Specify whether the final evidence is real test-network settlement, an on-chain program enforcing authorization, or a simulation. The interface must not overclaim the resulting security boundary.

PM preference: accept only a scope in which the complete invariant can be demonstrated and independently checked, with UI polish allocated as core work. Any absent enforcement boundary must be represented plainly and cannot be hidden behind a successful demo sequence.
