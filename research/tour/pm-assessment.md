# Independent PM assessment — guided static tour

Actor: /root/tour_pm. Date: 2026-09-30. This is an independent product assessment before the UX proposal, not implementation authorization or an ABU-11/17 receipt. Parent /root remains the sole control-plane writer.

## Product outcome

A judge opening the GitHub Pages URL should understand the actual product in a few minutes: approvals authorize a particular invoice amount; a subsequent accepted credit invalidates the earlier authorization; the Solana program rejects the obsolete instruction; two fresh approvals allow the corrected amount to settle once. The experience should present Kontor's existing workbench screens and require meaningful clicks at the causal transitions. A screenshot gallery or landing-page claim alone does not communicate this mechanism.

The fixed narrative is Northform Studio NF-2026-041, 1,000 Test USD, Mara and Jonas approve, Lena accepts a 200 credit, previous approvals expire, Alex tests the obsolete instruction, fresh Mara and Jonas approvals authorize 800, and a receipt connects to historical devnet proof. Approvers can be introduced through guided context rather than forcing aimless role discovery. Avoid additional product functionality.

## Evidence and truth boundary

README.md documents the genuine devnet program, synthetic custom Test USD mint, server-held demonstration role keys, upgrade authority, and scope limits. evidence/devnet-summary.json supplies the real staleRejected and paid800 signatures. evidence/devnet-ordering-proof.json records the correction-first scenario and transaction logs, including StaleRevision, unchanged prior signed-byte digest, valid blockhash, no Test USD movement, and corrected payment. These are existing historical executions, not executions caused by clicks in the static tour.

Persistent concise label: “Guided tour · simulated interactions.” Near the first action and final receipt explain: “This tour replays the workflow locally. No transaction is submitted. The receipt links to a recorded Solana devnet run.” Use “Recorded devnet proof” for explorer links and evidence downloads. Never display fresh-looking pending/confirmed network activity caused by a local state transition. Amounts remain Test USD, no real value; do not use USDC or imply Circle issuance. If dates or transaction identities appear, preserve the original evidence dates and identities. Explicitly identify the recorded proof as a separate prior run if the tour state is recreated rather than an exact recording.

Describe the blocked attempt precisely: no Test USD moved. A failed Solana transaction may still charge a SOL fee, so “no funds moved” is too broad. Protected boundary remains the program-controlled payable and vault. No security-audit, real authentication, production custody, accounting certification, or universal cross-wallet prevention claim.

## Proposed P0 acceptance

1. Public Pages URL opens without installation, backend, wallet, credentials, or local state; reload starts in a usable deterministic tour state and restart is available.
2. Existing product visual structure is recognizably preserved: payable detail, original invoice, current amount, named approvals, credit, and Evidence view. Guide text explains the next action and why it matters without covering key content.
3. The judge must traverse original two approvals, 200 credit, expired approvals, obsolete instruction rejection, fresh two approvals, 800 payment, and recorded proof. No jump from start directly to success is the primary path.
4. At each transition the displayed arithmetic and approval status agree. After credit, current approval readiness is zero of two; previous approvals remain inspectable as expired; the obsolete instruction is clearly for 1,000 and cannot become a normal payment action.
5. Final screen distinguishes local tour completion from historical confirmed 800 devnet payment. It links to the exact recorded corrected payment and stale-rejection evidence with devnet cluster; evidence download identifies its recorded origin.
6. Keyboard operation, clear focus, readable text and progress, Back/Restart without broken state, and a narrow-screen usable layout are verified on the hosted build.
7. Source-aware integration verifies no RPC/signing/backend calls from tour interactions and no bundled keys/local manifests, coherent state transitions and correct evidence-link identities. Existing live app tests/build still pass if shared UI changes.
8. Fresh-context browser reviewer explains the 1,000−200=800 arithmetic, why approvals expired, what was blocked, what is simulated, and what the historical receipt actually proves. Review is browser-only by instruction under the user-approved limitation, not claimed fully isolated or genuinely blind.

## Exclusions and tradeoffs

No hosted backend, wallet connection, newly submitted devnet payment, production onboarding, additional invoices/integrations, or revision of the program's guarantees. No paid services or new spending. Existing live backend remains separate. A deterministic scripted local adapter is acceptable if it uses real product screens and cannot reach live signing; static snapshots with hotspots may be a fallback only if engineering demonstrates fidelity and keyboard usability. Reusing actual screen components trades a little implementation complexity for less visual drift and a better judge experience.

Keep the broader payment-first and duplicate-payment proofs discoverable in optional evidence, not mandatory tour branches. The central judge journey is the correction-first sequence. Final product acceptance awaits the UX proposal and an explicit engineering feasibility response.
