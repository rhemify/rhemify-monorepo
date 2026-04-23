# ADR-001: Use solana-go as local module via replace directive

## Status

Accepted

## Date

2026-04-07

## Context

The Go intelligence server needs to build, sign, and submit Solana transactions for the rhemify-dwallet Anchor program. We need a Go Solana SDK that provides:

- RPC client for devnet/mainnet
- Transaction building and signing
- PublicKey/PrivateKey types and PDA derivation
- Borsh-compatible data encoding

The canonical Go SDK is `github.com/gagliardetto/solana-go`. It has 70+ RPC methods, full transaction support, and active maintenance.

## Decision

Clone solana-go into `solana-go/` at the repo root and reference it via a `replace` directive in `apps/server/go.mod`:

```
replace github.com/gagliardetto/solana-go => ../../solana-go
```

## Alternatives Considered

### Versioned dependency (`go get github.com/gagliardetto/solana-go`)

- Pros: Standard Go module workflow, automatic updates
- Cons: Cannot patch issues we find, version pinning adds friction for rapid iteration
- Rejected: During hackathon, we need to be able to fix issues in-repo instantly

### anchor-go (code generation from IDL)

- Pros: Auto-generates type-safe instruction builders from Anchor IDL
- Cons: Heavy code-gen step, generated code is hard to debug, only 4 instructions
- Rejected: Hand-building 4 instructions with Borsh encoding + Anchor discriminators is simpler and more transparent

### HTTP-only (call Solana JSON-RPC directly)

- Pros: No Go dependency at all
- Cons: Reimplements transaction serialization, signing, and PDA derivation from scratch
- Rejected: Too much low-level work; solana-go already handles this correctly

## Consequences

- Go server version bumped from 1.23 to 1.24 (solana-go requires it)
- ~80 transitive dependencies added (gRPC, OpenTelemetry, MongoDB driver, etc.)
- Any fixes to solana-go are local and don't require upstream PRs
- Must keep `solana-go/` in sync if upstream releases critical fixes
