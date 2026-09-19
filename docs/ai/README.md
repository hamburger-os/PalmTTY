# AI working documentation

This layer is the operational contract for coding agents working on PalmTTY.

Read in this order:

1. [invariants.md](invariants.md) — rules that must not be broken casually
2. [current-state.md](current-state.md) — what is actually implemented now
3. [sync-contract.md](sync-contract.md) — which documentation must change with code
4. [acceptance.md](acceptance.md) — checks required before completion

Also read the relevant Chinese owner module under [../owner/README.md](../owner/README.md).

Do not treat roadmap items as implemented behavior. Do not silently change an invariant; architecture-changing work must update both the invariant and the relevant owner/community documentation.
