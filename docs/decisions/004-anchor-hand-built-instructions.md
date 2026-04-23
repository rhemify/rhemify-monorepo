# ADR-004: Hand-built Anchor instructions with Borsh encoding

## Status

Accepted

## Date

2026-04-07

## Context

The Go server needs to build Solana transactions that call the `rhemify-dwallet` Anchor program's 4 instructions:

- `initialize_fleet_vault`
- `register_agent_wallet`
- `approve_signing`
- `freeze_agent`

Each instruction requires: an 8-byte Anchor discriminator, Borsh-encoded arguments, and correctly ordered account metas.

## Decision

Hand-build instruction data in Go using:

1. Anchor discriminator = `SHA256("global:<instruction_name>")[:8]`
2. Custom Borsh encoding helpers (`borshString`, `borshU64`, `borshVecString`, `borshPubkey`)
3. `solana.NewInstruction(programID, accounts, data)` from solana-go

Located in `apps/server/internal/solana/instructions.go` with PDA helpers in `pda.go`.

## Alternatives Considered

### anchor-go (IDL code generation)

- Pros: Auto-generates type-safe builders, less manual encoding
- Cons: Requires IDL JSON file, generated code is verbose and hard to debug, adds a build step
- Rejected: Only 4 instructions — hand-building is faster and more transparent

### Borsh encoding library (e.g., `github.com/near/borsh-go`)

- Pros: Handles struct serialization automatically
- Cons: Another dependency, may not match Anchor's exact encoding for Strings and Vecs
- Rejected: Our helpers are ~30 lines total; adding a dependency is overkill

## Consequences

- Discriminator correctness is verified by unit tests comparing against SHA256
- PDA derivation is tested for determinism and uniqueness
- If instruction signatures change in the Anchor program, Go instruction builders must be updated manually (no auto-sync)
- Borsh encoding for Strings uses 4-byte LE length prefix — must match Anchor's Rust encoding exactly
