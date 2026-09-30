#!/usr/bin/env bash
set -euo pipefail
cargo build-sbf --manifest-path programs/kontor/Cargo.toml --sbf-out-dir programs/kontor/target/deploy -- --locked
sha256sum programs/kontor/target/deploy/kontor.so
