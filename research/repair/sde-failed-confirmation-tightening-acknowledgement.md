# SDE acknowledgement of failed-metadata tightening

Actor /root/repair_sde performed source-aware read-only review of the parent change to validFailureMetadata and its four added regressions. No product edits or live actions in this acknowledgement.

Engineering compatibility confirmed. My earlier enum-name syntax check accepted invented names, and its u8 instruction-index bound did not ensure that the named instruction actually existed in this transaction. The independent tester correctly identified both gaps. Restricting fallback acceptance to the exact InstructionError [index, {Custom: unsigned32}] shape and index below the sent transaction's instruction count closes those gaps while preserving the accepted known-failure path. All other variants, including legitimate unsupported enum failures, conservatively remain UnknownOutcome.

Custom7002 and Custom7003 at index1 in the normal two-instruction transaction remain accepted, so the parent's reported completed supplemental devnet proof uses an unaffected path. This acknowledgement is a source compatibility conclusion, not an independently repeated live proof. Exact prepared/confirmed byte identity, same signature, failed-only classification, single application send and no successful-outcome promotion remain unchanged. No protocol, account, payment, remainder-release or service recovery invariant changes.

Read the four added cases: invented transaction enum, invented instruction enum, unsupported known enum and index255 out of bounds. Parent is running the updated 176-test suite; this note does not claim its result before completion. This tightening supersedes the broader enum-name acceptance described in the prior SDE implementation receipt.
