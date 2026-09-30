# Independent source-aware review

Reviewer: `/root/tour_integration`. Scope: projection module, curated public evidence and publication-audit design. Browser checks remain pending the parent's ready signal.

## Observed checks

A one-off independent assertion run imported the actual projection module through the repository's TS runtime and compared its outputs to an explicitly specified chronological matrix, rather than reproducing its algorithm. Results are in `integration-source-results.json`.

- All curated final-state fields equal the original `evidence/browser-recovery-export.json` fields. The original-file SHA-256 and committed documents match.
- Exactly seven scenario/event-linked proofs survive selection. All source proof fields match after the deliberately public-safe removal of internal controller/path metadata. No other scenario is included.
- Event boundaries 1–8 retain precisely the corresponding original event prefix, and every included approval predates/equal the boundary. Expected current approval counts are 0, 1, 2, 0, 0, 1, 2, 2; expired counts are 0, 0, 0, 2, 2, 2, 2, 2. Status, 1,000/800 amount and app revision 1/2 match those transitions.
- Settlement exists only at the final boundary. Earlier chain balances are null; final values remain 200 vault and 3,400 recipient. The original instruction exists only after both initial approvals; its tested flag appears only from the rejected attempt.
- Projection imports only a type contract and static JSON; no server, signing or transport implementation. Eleven explicit tour substates preserve both approval pairs and payment review.

## Finding and verified resolution

The initial curated proof for Mara's revised 800 approval omitted source `reconciled: true` and all `legacyBinding` metadata. Generic text that one historical approval was reconciled did not identify the affected proof. Reported to parent before any edits. Parent restored `reconciled`, exact binding kind/time and a signature-local public provenance note, omitting internal controller/path. The rerun verified this resolution. This distinction matters because the binding was later controller-attested; it was not a presubmission capture.

## Publication audit limits

`scripts/build-tour-audit.mjs` enforces a narrow file-path/extension allowlist, no symlinks, selected known secret/path/source-map patterns, exact built JSON equality with the curated artifact, seven event-linked proofs for the selected scenario, 800 settlement, zero stale Test USD movement and relative HTML asset paths. Those are useful bounded checks, not a general secret detector or execution proof. It does not establish that arbitrary JS/CSS content is safe, detect every credential encoding, trace dynamic imports/network requests, or independently compare curated proof content to the historical source. The source comparison above and upcoming built-browser network capture supplement those limits. Live API string literals in a shared compiled App are not by themselves an observed API call; guards and runtime requests require separate review.

No application, fixture, configuration, live state, Git or cloud changes were made by the reviewer. Only assigned integration report files were written.
