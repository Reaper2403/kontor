# Kontor — independent UX assessment

Author: Codex UX agent `/root/build_ux`. Date: 2026-09-30.
Status: independent pre-build recommendation; no sibling assessment read, no visual direction accepted, no implementation authority implied.

## Intended experience

An accounts-payable operator should be able to answer four questions without understanding Solana: What do we owe? Who approved that exact amount? What changed? What actually left the account?

The distinctive interaction is a payable whose business facts change after approval. The product must make the causal chain visible: 1,000 USDC approved → 200 USDC credit applied → amount due 800 USDC → earlier approvals no longer cover this payable → fresh approvals → one 800 USDC payment. It must never imply that an issued payment can be recalled.

## Recommended journey and screen topology

Use a compact three-destination application with one primary workbench. Avoid a generic analytics dashboard, vanity KPI strip, or sprawling ERP navigation.

1. **Payables** is a focused inbox, not a dashboard. It has supplier, invoice, amount due, due date and business status. The synthetic case is easy to open; no more than two incidental rows are needed if useful for realism. Outstanding totals must not imply real funds. A clearly separate persistent environment label says `Test workspace · Test USDC`.
2. **Payable detail** is the primary experience. The heading pairs supplier and invoice number with the current amount due. A central document-like invoice/credit area is paired with a fixed-width review/action panel. The panel shows the current payable amount, named required approvers, approval status, and one primary next action appropriate to the active demonstration role. A compact vertical history records meaningful events with actor, time, and amount. Tab labels can be `Overview` and `Evidence`; history should not disappear behind a second navigation hierarchy.
3. **Evidence** is a subview of the same payable, reached from the detail, not a separate disconnected dashboard. It connects the invoice, credit, approvals and payment in a readable sequence. Expandable technical details can expose transaction links and identifiers without imposing them on an accountant. The closing state includes a payment receipt for 800 USDC and the earlier blocked 1,000 USDC attempt as distinct outcomes.

Minimum route budget: payables list and one payable detail route; Evidence can be a local tab. Credit entry is a side panel or modal, and payment confirmation is a compact modal rather than new pages.

## Core state sequence and copy

| State | Primary explanation | Primary action | Required visible evidence |
|---|---|---|---|
| Needs approvals, 1,000 due | `Two approvals required before payment` | `Approve 1,000 USDC` for an eligible approver | Named approvers and amount covered |
| Approved, 1,000 due | `1,000 USDC approved by [A] and [B]` | `Pay 1,000 USDC` for eligible payer | Two separate approvals; `Apply credit` remains accessible to authorized operator |
| Credit confirmation | `Apply 200 USDC credit? Amount due becomes 800 USDC. The two existing approvals will expire.` | `Apply credit` | Invoice amount 1,000; credit −200; new amount due 800 |
| Credit applied; reapproval required | `Amount changed. Get two new approvals for 800 USDC.` | `Request new approvals` or the eligible role's `Approve 800 USDC` | Earlier approvals visibly labeled `Expired after credit`, never quietly removed |
| Old-payment verification | `Blocked — the earlier approvals covered 1,000 USDC. No payment was sent.` | `Return to payable` | Attempted 1,000, current 800, failed outcome, zero funds moved |
| Approved, 800 due | `800 USDC approved by [A] and [B]` | `Pay 800 USDC` | Fresh approval amount and identities |
| Paying | `Submitting 800 USDC payment…` | Disabled submission control | Clearly distinct pending versus confirmed state |
| Paid | `Paid · 800 USDC` | `View payment evidence` | Confirmed amount, recipient, time and receipt; no active pay button |

Wording recommendation: use `Approvals expired` in business UI rather than `signature invalidated`, `nonce bumped`, `revision mismatch` or `stale authorization`. The Evidence technical expansion can use exact technical labels for reviewers.

## Interaction rules

- Approval controls name the amount every time. The user sees both amount and recipient before confirming a payment.
- Credit entry captures amount, credit-note reference and short reason. Use prefilled synthetic data, with a real readable confirmation rather than an unexplained instant mutation. A known fixture should let the 200 USDC path be completed reliably.
- Do not bake the entire story into a single autoplay button. The user must cause and understand the change. A separate `Demo controls` area may switch the active synthetic persona and reset the scenario. Persona switching must be conspicuous; do not imply one logged-in person has secretly provided two independent approvals.
- Normal users should never be asked to submit an invalid payment. Put `Test previous approval` in a labeled demonstration/testing section, visible enough for a judge to find, and show the expected attempted amount before action. In business history, call the result `Earlier payment attempt blocked`.
- A blocked attempt must not use the same red toast style as a product error; it is a successful control demonstration with a neutral, persistent result. Announce `No payment was sent` in text.
- While payment is submitting, suppress repeated actions. A refresh or retry must resolve to the same receipt if payment already succeeded. State whether the result is unknown when network confirmation is unavailable.
- Distinguish test funds and local/simulated behavior from a confirmed on-chain event. No invented explorer link or transaction hash may be shown as verified evidence.
- Prefer actual approver names and roles to naked wallet addresses. Secondary detail may show a shortened address and copy action with a fully accessible name.

## Visual direction to investigate after flow agreement

My provisional direction is a calm editorial finance workbench: deep ink, warm paper, disciplined rules, typographic monetary hierarchy and one memorable restrained accent. An invoice document should feel like the center of the work, and the approval rail should act as its companion. Reject gradients, decorative charts, excessive cards, cryptocurrency mascots and default purple SaaS styling unless visual research produces a better task-specific reason.

After the fleet accepts screens/flows, browse references for document-centric accounting review, modern treasury transaction detail, and editorial tabular typography. Extract layout, density, status and interaction lessons. Do not copy another product's branding or pretend a marketing screenshot proves usability. Use 2–4 concrete references to establish spacing, typography, color, surfaces, navigation and state treatments before implementation.

## Accessibility and usability acceptance

- At a desktop viewport around 1365 × 900, current amount, payment readiness and next action are visible without scrolling. At 1024 px the rail may stack; at narrow widths the meaning/order survives rather than shrinking the document into unreadable text.
- Keyboard users can traverse the list, tabs, approver actions and modal; Escape closes non-destructive overlays; focus returns to the trigger; submitting/loading states are announced.
- All statuses have text and sufficient contrast; neither green/red nor an icon alone carries meaning. Amounts use tabular numerals and consistent `USDC` units; reductions include minus sign plus `Credit`.
- Invoice 1,000, credit −200, and due 800 remain visible together after the change. Expired approvals are visually quieter but legible.
- An accountant evaluator can identify the amount due, explain why new approvals are required, identify who approved the current amount, and prove that only 800 was paid without inspecting technical details.
- The empty/loading/failure cases explain the next recoverable action. A failed request must not visually advance the payable state.
- Test workspace labeling remains persistent but does not overwhelm the business hierarchy. Persona controls are clearly separated from ordinary account navigation.

## UX risks and questions for negotiation

1. If backend constraints require three wallet interactions per human action, expose only the user-relevant signing/waiting steps and keep the amount and recipient stable across them; otherwise the core story may become a wallet setup demo.
2. Calling the old-payment test `Pay 1,000` after the UI already knows 800 is due can teach unsafe behavior. Recommendation: a clearly labeled demonstration control using previously captured approval, with the blocked result surfaced in Evidence.
3. An active-persona switch is suitable for a hackathon demonstration only when clearly declared. It does not establish production separation of duties.
4. If the invoice is only a structured fixture, do not fake a detailed scanned invoice viewer. A well-designed synthetic invoice document is sufficient and more readable.
5. `Request approvals` cannot imply notifications were sent if no notification implementation exists. Prefer local `Ready for approval` state and actionable persona switch unless real request delivery exists.

## Suggested evaluator task

Ask a fresh isolated browser-only accounting persona to process the provided payable, apply the supplied credit before payment, obtain required approvals, complete payment, and determine whether the original amount could still be paid. Do not give the state machine, tell them where controls are, or disclose previous findings. Record observed paths, mistakes and their own explanation of the final outcome. Use a source-aware integration test separately for actual authorization, stale rejection, amount conservation and duplicate prevention.
