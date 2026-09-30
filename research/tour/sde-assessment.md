# Independent SDE assessment — public static tour

Actor: `/root/tour_sde`. Date: 2026-09-30. Status: provisional research, awaiting UX → PM → SDE → PM decision. Parent remains sole control-plane writer. No deployment, Git mutation, chain operation or paid resource initiated by this assessment.

## Feasibility and recommendation

Feasible within the existing React/Vite toolchain and static hosting. Build an isolated tour entry and static output directory; do not publish the existing live app build unchanged. Keep the private application repository private. A separate public `kontor-tour` repository can carry only reviewed publication assets if private-repository Pages is unavailable on this account.

The minimum architecture depends on the product choice still under review:

1. For a genuinely navigable UI tour, add a narrow explicit read-only snapshot input to the existing App presentation and mount it from a separate tour entry. Read-only rendering must prevent the initial refresh effect, actions, reconciliation, reset and live evidence export. The tour owns chapter navigation and supplies fixed recorded-state projections. App inbox/detail/evidence interactions may remain local. Avoid a general fake API, service worker intercept or chain simulator: these add hidden behavior and make the claim boundary harder to audit.
2. If UX selects an illustrated step reader, render clean captures from those same recorded-state projections and publish a small standalone HTML/CSS/JS viewer. Captures preserve the actual product design with minimal coupling and no app transport code. The tradeoff is that controls visible inside images do not respond and mobile readability needs deliberate cropping/zoom or accessible adjacent text.

An explicit adapter is a routine implementation choice only after UX/PM accepts the interaction model. Do not implement both models speculatively.

## Source facts

- `src/App.tsx` combines presentation and transport in one component. It fetches `/api/state` on mount, posts `/api/actions` and `/api/reconcile`, and links `/api/evidence`. Merely uploading `dist/` would create a broken live workspace on Pages.
- `contracts/api.ts` cleanly defines the display `State`: invoice, credit, approvals, evidence and settlement. This can supply read-only snapshots without importing server code or Solana SDKs.
- `src/styles.css` is reusable local CSS. Existing frontend imports React and lucide-react; there is no necessity for a remote font, wallet, RPC or backend in a tour.
- `vite.config.ts` is configured for the local app and root-relative proxy. A distinct build config must set the publication base path or relative asset base, disable source maps and write a separate output directory. Hash/chapter state or simple local state avoids Pages deep-route 404s.
- `evidence/browser-recovery-export.json` has the complete final recorded scenario `c3f46241-966e-4264-ac88-035ed095ca23`, 1,000 → 800 Test USD, CN-204, seven transaction-linked evidence events and a local created event. Its `networkProofs` also contains an earlier scenario: exports for publication must select by scenario and event signature, not copy all records indiscriminately.
- Application invoice revisions are displayed as 1/2 while corresponding program log revisions are 0/1. Preserve this offset and do not conflate them in explanatory text.
- The later approval recovery event was controller-bound from a legacy journal; if included, disclose that provenance. It is unnecessary to the central 1,000 → credit → stale instruction blocked → 800 payment story.

## Evidence projection and honesty boundaries

Use one scenario consistently. Build chapter state from the recorded events and original immutable invoice fields. Preserve original timestamps, signatures, credit reference/reason, amount, recipient and program/mint identifiers. A chapter is a reconstruction of recorded state, not a freshly observed chain response. State that visibly and in downloadable metadata.

Before the credit, show revision 1, no credit and only evidence through that point. After credit, show revision 2, 800 due, old approvals expired and only the then-current approvals. Paid state appears only after the payment event. Previous-instruction result appears only after the rejected attempt. Do not copy final vault/recipient balances backward in time; either derive from the matching proof explicitly or omit intermediate balances. Preserve `outcome: failed` for the stale transaction and confirmed outcome for actual payment.

The recorded stale instruction has `Custom: 7002`, `Kontor::StaleRevision`, preserved bytes hash, valid blockhash and unchanged token balances. The payment records `Kontor::Paid amount=800000000 revision=1`. Link both exact signatures to Solana Explorer with `?cluster=devnet`. Explorer availability is external; the site's own explanation should still function without it. Download a small allowlisted evidence document with immutable source digest and selection/projection metadata, not raw private runtime state.

Persistent site disclosure: recorded interactive tour; Solana devnet; synthetic invoice and custom Test USD with no real value; no new payment is sent. Historical evidence labels may say confirmed on devnet if the visible wrapper makes their historical nature clear.

## Publication and test boundary

Publish only a clean build directory containing HTML, bundled local assets, approved captures (if selected), explicitly curated evidence JSON and `.nojekyll` if branch publication requires it. No source tree copy, `.git`, `.local`, `.env`, runtime state, keys, node_modules, private issue text, screenshots of secrets or source maps. No server imports in the client dependency graph. A public built JavaScript bundle is inherently readable: do not claim publication hides the frontend code.

Before upload: build/typecheck, check output allowlist and dependencies, inspect asset references under `/kontor-tour/`, test every chapter at desktop and narrow widths, keyboard navigation/focus, historical event integrity and download. Browser network check should show no API/RPC/backend requests or transaction submission while walking every interaction. Verify disabled/removed product action controls cannot invoke hidden handlers. Refresh on the published path must work. Validate the deployed URL, assets and evidence download after publication.

Use the existing additional $10 total envelope (about $0.078 already estimated) only through the parent-owned budget ledger. No paid cloud runtime, backend, domain purchase or live wallet is needed for this architecture.

## External references verified read-only

GitHub identifies Pages as static HTML/CSS/JavaScript hosting, project sites under `/<repositoryname>`, available for public repositories on Free and private repositories on paid plans: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages (read 2026-09-30). Account eligibility still needs parent verification; plan null is not evidence of entitlement. The official Vite static deployment page returned 503 during this research, so no claim relies on that fetch.

## Open risks / dissent

No engineering blocker to a read-only tour. I object to publishing the unmodified app, using a fake signing API, claiming current balance/state from historical evidence, copying final balances into earlier chapters, publishing the private repository to obtain Pages, or making in-tour clicks appear to send fresh transactions. Model choice and chapter design remain for UX/PM. Fresh source-aware tests cannot be labeled blind evaluation; any unavailable blind isolation is handled through the parent and existing user authority.
