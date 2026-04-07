# ADR-005: Plaintext on-chain policy enforcement (no FHE)

## Status
Accepted

## Date
2026-04-07

## Context
The original spec considered FHE (Fully Homomorphic Encryption) for on-chain policy checks — comparing encrypted amounts against encrypted limits without revealing values. However:
- Ika's current SDK does not support FHE operations
- FHE adds 10-100x computation overhead
- For hackathon demo, policy transparency is more valuable than privacy

## Decision
Use plaintext `u64` fields for all policy enforcement in the `rhemify-dwallet` Anchor program:
- `max_per_tx: u64` — per-transaction limit
- `daily_limit: u64` — daily spending cap
- `daily_spent: u64` — running total, resets on day boundary
- `amount: u64` — transaction amount

Policy checks use standard integer comparison:
```rust
require!(amount <= wallet.max_per_tx, ExceedsPerTxLimit);
require!(wallet.daily_spent + amount <= wallet.daily_limit, ExceedsDailyLimit);
```

All arithmetic uses `checked_add` with proper error returns (no panics).

## Alternatives Considered

### FHE-encrypted amounts
- Pros: Privacy-preserving policy enforcement
- Cons: Not supported by current Ika SDK, 10-100x overhead, complex key management
- Rejected: Deferred to post-hackathon when Ika adds FHE support

### Off-chain only (no on-chain policy)
- Pros: Simpler, no Solana program needed
- Cons: No verifiable enforcement — fleet operators must trust the Go server
- Rejected: On-chain enforcement is the core value prop ("verifiable payment layer")

## Consequences
- Transaction amounts are visible on-chain (Solana is public anyway)
- Policy limits are publicly readable from PDA accounts
- Daily reset uses Unix timestamp day boundary (UTC)
- Integer overflow protected by `checked_add` with error return
- Migration path to FHE: replace `u64` with encrypted types when Ika supports it
