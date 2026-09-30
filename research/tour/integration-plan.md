# Static tour integration plan

Owner: `/root/tour_integration`, independent source-aware integration tester. Parent `/root` is sole control-plane writer. This plan is prepared from accepted `KONTOR-TOUR-01`, UX proposal, PM final acceptance and SDE feasibility. It is not browser evidence or a blind usability evaluation. Actual checks begin only after parent announces a built preview ready at `http://127.0.0.1:5174/kontor-tour/`.

## Scope and method

Use bundled Playwright and installed Chrome against the built static preview, at desktop (1440 × 1000) and phone (390 × 844). Capture requests, console/page errors, screenshots, visible state and focused element. Interact only with the static tour. Block and report unexpected API/RPC/backend/network submission attempts; never supply a wallet, keys, payment, live reset or other live mutation. Read source and built files to corroborate runtime safety and the publication allowlist. External historical explorer link correctness is checked from exact identities, not by submitting or asserting present chain availability.

| ID | Check | Required result |
| --- | --- | --- |
| T01 | Open repository-subpath URL directly and reload | All application assets and curated evidence resolve; no blank page or missing resources. Persistent static replay/devnet/synthetic Test USD language; welcome says clicks send no transactions. |
| T02 | Run every forward guide action and all six chapters | Original 1,000, separate Mara and Jonas approvals, Lena's 200 credit, revised 800, two expired original approvals, Alex's rejected 1,000 instruction, separate fresh approvals, payment review, 800 paid receipt and evidence remain distinguishable. |
| T03 | Check each state against projection/source evidence | Correct amount, app version, status, current/expired approvals, actor and evidence chronology. No future events or final balances appear early. App versions 1/2 remain distinct from program revisions 0/1. |
| T04 | Back, Next, direct chapter selection, Restart, welcome evidence shortcut | Deterministic coherent snapshots, current chapter and progress; restart affects only wrapper state. Returning after local evidence/inbox inspection restores intended scene. |
| T05 | Exercise every remaining local control | Tabs, inbox/detail, filters, disclosures, copy and downloads work locally; no inert live-looking mutation controls. Payment dialog callback says it shows a recorded result. |
| T06 | Capture requests during T01–T05 | Only same-origin static GET assets/evidence (and explicitly opened historical external links if tested). Zero `/api/`, backend-port, RPC, signing, POST, fetch execution or unexpected websocket requests in built preview. Guards for refresh, actions and reconciliation also fail closed in source. |
| T07 | Review final evidence and download | Valid JSON, scenario `c3f46241-966e-4264-ac88-035ed095ca23`, selected events match original export exactly, seven selected event-linked network proofs; no unrelated `c863ba5a` scenario. Download works under `/kontor-tour/`. Historical reconstruction and legacy approval provenance remain explained. |
| T08 | Verify explorer links | Exact event signatures, `cluster=devnet`, stale proof marked rejected, final settlement `mEzYqsk328ch5SeDtwpjN1coekQ8fsoJcvSeReob5mrrZanATzvSRmYRLKQckTWTuyE2agiRbCdkg8m97Ly1pxL`. Rejection means no Test USD moved; no zero-fee claim. Private source links omitted or accurately labeled. |
| T09 | Repeat complete path at 390 px | No horizontal page overflow. Guide and primary action readable; guide and payment review before invoice. Long identifiers wrap/disclose. No fixed control covers actions, evidence or focus. Capture representative credit, blocked, modal and receipt views. |
| T10 | Keyboard-only guide and local controls | Tab/Shift+Tab and Enter/Space work; visible focus; descriptive names; chapter `aria-current`; scene-result polite announcement; deliberate focus destination after scene changes. Payable tabs support their documented arrows. |
| T11 | Native payment dialog | Focus enters dialog and stays contained through Tab/Shift+Tab; close/Escape restore usable navigation; recorded result leads to correct paid snapshot. Test phone and desktop; no background click-through. |
| T12 | Reduced motion | With `prefers-reduced-motion: reduce`, no autonomous advance, no focus-obscuring animation and no meaningful state conveyed only by movement/color. |
| T13 | Artifact/source allowlist | Static output only reviewed HTML/CSS/JS/assets/evidence; no source maps, source tree, internal research, `.local`, credentials, keys, runtime manifests or server artifacts. No server/signing imports in tour module graph. Public bundle readability is expected. |
| T14 | Shared App regression evidence | Review SDE/parent actual test/build results and read-only live smoke; independently inspect optional prop defaults and absence of unrelated live behavior changes. Do not run live transactions to test the tour. |

## Reporting and limits

Write observed results to `research/tour/integration-results.md` and machine-readable evidence/screenshots under `research/tour/integration-*` as needed; optional reusable harness only at `tests/tour-browser.mjs`. Report blocking issues to parent before any fix. No app edits, Git mutations, cloud operations or deployment. Check local artifact allowlist before publication; deployed public-page smoke is parent-owned unless explicitly delegated. A passing source-aware integration report does not replace the separately required fresh-context usability review and does not claim enforced browser isolation.

The test boundary is bounded to the accepted static tour. External Explorer service availability is not a release blocker when correctly labeled local recorded evidence works. Actual preview results, scene names and emitted files will be recorded from the implementation rather than invented in advance.
