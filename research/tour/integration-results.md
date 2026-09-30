# Static tour integration results

Reviewer: `/root/tour_integration`, source-aware independent tester. Local built URL: `http://127.0.0.1:5174/kontor-tour/`. Browser: installed Chrome, separate headless Playwright contexts, desktop 1440 × 1000 and phone 390 × 844. No source changes or live actions. This is not a blind usability review.

## Current verdict

One open acceptance issue: the sticky navigation hides some keyboard-focused evidence controls at 390 px. Other completed checks pass. Publication should wait for the targeted focus fix and recheck.

## Passing evidence

- Complete ten-snapshot forward journey passes at both widths, with correct headings, chapter marker and polite announcement; nonmodal scene changes focus the guide heading. Projection correctness was independently established for all eight historical event boundaries in `integration-source-results.json`.
- Back, four direct nonmodal chapters, payment chapter, Restart, home and welcome evidence shortcut restore their expected coherent scene. Actual app tabs, arrow-key tab selection, invoice inbox/detail, all three filters, technical disclosures and copy controls work locally. Forbidden live mutation buttons are absent.
- Payment review opens a native dialog, keeps focus inside under repeated Tab/Shift+Tab, closes with Escape and advances to paid only through the recorded-result action. Dialog is readable and fits at 390 px. No transaction execution occurs.
- Browser download JSON equals the curated artifact exactly. All nine rendered transaction links correspond to selected event signatures and use `cluster=devnet`, including the settlement. External Explorer pages were deliberately not opened; present chain availability is not asserted.
- During all these static-tour interactions, captured requests were only same-origin document, JS and CSS GETs; no API, RPC, backend, POST or WebSocket attempts, and no console/page errors. Download contents were verified separately via the browser download event. Source guards independently prevent refresh/actions/reconciliation in tour mode.
- Every snapshot has no horizontal page overflow. Phone payment panel precedes invoice. Reduced-motion context has no active animations. Full initial-scene keyboard traversal passes visibility/occlusion checks for controls at both widths; evidence-scene traversal exposed the issue below.
- Final scoped UX rebuild verified immediate hero disclosure ('Your clicks send no transactions') and visible phone recorded actor name/role. Rebuilt artifacts and hashes are captured in `integration-final-smoke-results.json`.
- Live App read-only smoke successfully loads existing paid inbox at port 5173. Only GETs, including `/api/state`, were allowed; no live controls were used. Its current persisted sample is 700 Test USD, separate from the tour's historical 800 sample. This smoke verifies rendering/default transport, not all live mutation behavior. Parent/SDE report shared build and 115 tests passed; those reports are corroborative rather than independently rerun here.
- Output inventory is exactly HTML, one JS, one CSS, curated evidence and `.nojekyll`; no other output files. Audit design limitations remain documented in `integration-source-review.md`.

## Open issue: keyboard focus behind sticky footer

At 390 × 844, choose **Inspect recorded evidence** from welcome, then repeatedly Tab. The browser leaves several focused controls nominally inside the viewport but behind `.tour-navigation`: Evidence tab (y762–806), Recorded evidence JSON link (y776–792), View transaction (y773–798), and corrected settlement proof card. Focus styles are present, but hidden by the footer. `document.elementFromPoint` at each focused center resolves to the overlay; screenshots visually confirm. This violates accepted focused-element visibility.

Reproduction: `research/tour/integration-focus-repro.mjs`. Exact geometry: `integration-focus-issue.json`. Screenshot: `../.kontor-control/tour-integration-focus-issue-2.png`. Reported to parent before any fix. Reviewer has not modified app source.

## Artifacts and remaining work

Executable checks and results: `integration-browser.mjs`/`integration-browser-results.json`, `integration-keyboard.mjs`/`integration-keyboard-results.json`, `integration-final-smoke.mjs`/`integration-final-smoke-results.json`. Representative screenshots are outside the publish tree under `../.kontor-control/tour-integration-*`. Initial keyboard results include a BODY focus transition at browser tab-cycle wrap; that is not an obscured interactive control and is not classified as a defect.

Need targeted final-build keyboard evidence recheck after the fix. Public deployment smoke remains parent-owned. Overall workflow acceptance also requires the separate fresh-context usability gate; passing this integration report alone does not satisfy it.
