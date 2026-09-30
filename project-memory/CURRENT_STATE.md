# Current state

Kontor hackathon prototype is complete within the accepted scope. Application source `2bc4e3e232e5aa156cb1b4d2cae8c5c29ce78aaa` passed the final remote deterministic check (run 36758931988). Later handoff changes contain records only.

The app runs locally at http://127.0.0.1:5173 with backend on loopback port 4310 and the deployed Solana devnet program. The current sample is paid at 800 Test USD. Reset creates another synthetic scenario and archives the previous one; use the README demo sequence. Browser evaluation harnesses have been stopped.

Verification: 109 service/client tests, including 65 independently authored recovery cases; 31 checks on the actual compiled program in a disposable validator; separate genuine devnet ordering proofs. Fresh accountant review 4 completed pending approval recovery and payment, scoring 19/20. Its starting state already contained the credit and original approvals, so this is not a fresh full-journey comparison. Browser-only isolation was instructional, explicitly approved by the user.

Three UI/recovery improvement cycles completed. User authorized two additional cycles after cycle two; one was needed. Minor event-link accessibility and secondary-text readability notes remain deferred. No blocking finding remains in the accepted demo scope.

Approval recovery checks an exactly bound confirmed transaction without resubmission. Other uncertain operations remain locked for operator assistance. Legacy interrupted approval was controller-bound from its preserved journal before browser recovery; see evidence/legacy-approval-binding.json.

Test USD has no value; server-held demo keys, trusted upgrade authority, no audit or production custody/accounting acceptance. No DATEV integration, ramps, invoice extraction or swaps. No real SOL purchased. Additional compute estimate $0.078 before allowances, with provider invoice unavailable, within $10 authorization.

Canonical decisions: issue 1 and its accepted improvement comments. Final artifacts: research/build/provenance.json, research/build/final-review.json, research/build/check-04-receipt.json, research/testing/recovery-result.json and evidence/browser-recovery-export.json. Parent /root is the sole control-plane writer.
