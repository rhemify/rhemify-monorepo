# 402 Endpoint Research (RHE-17)

Research for finding real HTTP 402 endpoints for the Rhemos demo. Goal: at least 2 (ideally 3 -- one per standard: x402, MPP, L402).

Last updated: 2026-04-10

---

## x402 (Coinbase + x402 Foundation)

### Protocol Summary

- **Spec**: v2 (current). Repo: `github.com/coinbase/x402` (5.8k stars)
- **Website**: x402.org
- **Flow**: Client requests resource -> Server returns 402 with `PAYMENT-REQUIRED` header (base64 JSON) -> Client signs payment, retries with `PAYMENT-SIGNATURE` header -> Server settles via Facilitator, returns 200 + `PAYMENT-RESPONSE` header
- **Token**: USDC (EIP-3009 on EVM, SPL on Solana)
- **SDKs**: `@x402/core`, `@x402/fetch`, `@x402/express`, `@x402/hono`, `@x402/mcp` (npm). Also Python, Go, Rust, Java.

### Headers (v2)

| Header | Direction | Content |
|---|---|---|
| `PAYMENT-REQUIRED` | Server -> Client | Base64-encoded PaymentRequired JSON |
| `PAYMENT-SIGNATURE` | Client -> Server | Base64-encoded PaymentPayload JSON |
| `PAYMENT-RESPONSE` | Server -> Client | Base64-encoded SettlementResponse JSON |

### Live Endpoints

**Test (verified working 2026-04-01):**

- `https://www.x402.org/protected` -- returns real 402 with payment requirements
  - Accepts: Base Sepolia (0.01 USDC) + Solana Devnet (0.01 USDC)
  - Facilitator: `https://www.x402.org/facilitator`

**Production services accepting x402:**

| Service | URL | What |
|---|---|---|
| Nansen | docs.nansen.ai | Blockchain analytics API (pay-per-call) |
| Pinata | 402.pinata.cloud | IPFS uploads without accounts |
| Firecrawl | firecrawl.dev | Web scraping, LLM-ready data |
| Browserbase | browserbase.com | Headless browser sessions for agents |
| Freepik | freepik.com | Design assets + AI image gen |
| Neynar | neynar.com | Farcaster social data API |

### Facilitators

| Name | URL | Networks | Status |
|---|---|---|---|
| x402.org | x402.org/facilitator | Base Sepolia, Solana Devnet, Aptos Testnet, Stellar Testnet | Testnet |
| Coinbase CDP | api.cdp.coinbase.com/platform/v2/x402 | Base, Solana, Polygon (mainnet + testnet) | Production |
| Kobaru | gateway.kobaru.io | Solana, Base, SKALE (mainnet + testnet) | Production |
| Bitrefill | api.bitrefill.com/x402 | Base, Arbitrum, Polygon, Solana | Production |
| x402.rs | facilitator.x402.rs | Base, Solana, Avalanche, Polygon, Sei, XDC + testnets | Production |

### Ecosystem Partners

Stripe, Cloudflare (co-founded x402 Foundation), Vercel, Google (a2a-x402), World (Worldcoin).

---

## MPP (Machine Payments Protocol -- Tempo Labs + Stripe)

### Protocol Summary

- **Spec**: IETF draft `draft-ryan-httpauth-payment-01` (active, expires Sept 2026)
- **Repo**: `github.com/tempoxyz/mpp-specs`
- **Flow**: Client requests resource -> Server returns 402 with `WWW-Authenticate: Payment` header -> Client pays off-band (on-chain or Stripe SPT) -> Client retries with `Authorization: Payment` header -> Server returns 200 + `Payment-Receipt` header
- **Payment rails**: Tempo (stablecoins on Tempo L1), Stripe SPT (cards, wallets, BNPL), Lightning, Card (Visa SDK)
- **SDKs**: `mppx` (npm, by wevm), `pympp` (Python), `mpp-rs` (Rust)

### Headers

| Header | Direction | Content |
|---|---|---|
| `WWW-Authenticate: Payment` | Server -> Client | Challenge with id, realm, method, intent, request params |
| `Authorization: Payment` | Client -> Server | Base64url JSON with challenge echo + payment proof |
| `Payment-Receipt` | Server -> Client | Base64url JSON with status + settlement reference |

### Payment Intents

- `charge` -- one-time payment per request
- `session` -- streaming channel (pay-as-you-go)

### Live Endpoints

**Production (Parallel API Gateway):**

| Endpoint | Method | Price | What |
|---|---|---|---|
| `parallelmpp.dev/api/search` | POST | $0.01 | Web search (one-shot or fast mode) |
| `parallelmpp.dev/api/extract` | POST | $0.01/URL | Structured data extraction |
| `parallelmpp.dev/api/task` | POST | $0.10-$0.30 | Deep async task processing |

Usage: `npx mppx https://parallelmpp.dev/api/search --method POST -J '{"query":"...","mode":"one-shot"}'`

**Self-deploy:**

- Cloudflare MPP Proxy (`github.com/cloudflare/mpp-proxy`) -- Worker that adds MPP 402 gating to any backend. One-click Vercel/CF deploy.

### MPP + Stripe SPT

When using Stripe as the payment method, the client generates a Shared Payment Token (SPT). The server creates a Stripe PaymentIntent with it. Supports cards, digital wallets (Link), BNPL. This is the AgentCard flow for RHE-12.

### Visa Integration

Visa published a Card-Based MPP Spec -- tokenized Visa credentials work inside MPP flows via the Visa SDK (npm). Uses Visa Intelligent Commerce + Trusted Agent Protocol for tokenization.

---

## L402 (Lightning 402 -- Lightning Labs)

### Protocol Summary

- **Spec**: Formerly LSAT, renamed to L402. By Lightning Labs.
- **Docs**: docs.lightning.engineering/the-lightning-network/l402
- **Flow**: Client requests resource -> Server returns 402 with `WWW-Authenticate: L402 macaroon="<base64>", invoice="<bolt11>"` -> Client pays Lightning invoice, gets preimage -> Client retries with `Authorization: L402 <base64-macaroon>:<hex-preimage>` -> Server returns 200
- **Token**: Bitcoin (Lightning sats)
- **SDKs**: `lsat-js` (Lightning Labs, npm), `l402-python`, `l402-server` (Rust)

### Headers

| Header | Direction | Content |
|---|---|---|
| `WWW-Authenticate` | Server -> Client | `L402 macaroon="<base64>", invoice="<bolt11>"` |
| `Authorization` | Client -> Server | `L402 <base64-macaroon>:<hex-preimage>` |

### Macaroon Structure

Contains caveats (conditions): service tier, capabilities, expiry, usage count. Root key bound to payment hash. After payment, preimage = authentication credential.

### Live Endpoints

| Service | URL | What | Status |
|---|---|---|---|
| Sulu.sh | api.sulu.sh | AI/LLM API access via L402 | Production |
| Matador.so | matador.so | L402 proxy service (any API behind L402) | Production |
| Lightning Labs Loop | swap.lightning.today | Submarine swaps | Production |
| Lightning Labs Pool | pool.lightning.today | Liquidity marketplace | Production |

### Self-Deploy: Aperture

Reference L402 reverse proxy by Lightning Labs (`github.com/lightninglabs/aperture`). Written in Go. Sits in front of any API, adds L402 auth. Requires LND node.

```yaml
# aperture.yaml example
services:
  - name: "myapi"
    hostregexp: "^api\\.example\\.com$"
    pathregexp: "^/v1/.*"
    address: "localhost:9090"
    price: 100  # satoshis
    constraints:
      timeout: 3600
```

### Challenge for Demo

Requires Lightning Network infrastructure (LND node). Harder to demo reliably than x402/MPP. Best approach: self-hosted Aperture on testnet, or use Sulu.sh/Matador.so if stable.

---

## MCPay (MCP + x402)

Separate from the three standards above, but relevant for the MCP server work (RHE-6).

- **What**: Adds x402 payments to any MCP server. Pay-per-tool-call.
- **Registry**: mcpay.tech/servers (now frames.ag/servers)
- **Protocol**: x402 under the hood
- **Pricing**: Flat per-call or per-tool tiered. No MCPay fees -- payments go direct to server owner.
- **Builder**: `mcpay-build` for one-click deploy
- **Repos**: `github.com/microchipgnu/MCPay`, `github.com/microchipgnu/mcpay-build`

---

## AgentCash

- **What**: CLI/agent platform -- "one balance, access to every API." Uses x402 + USDC on Base.
- **Stats**: ~395k API calls, ~61k installs, ~345 endpoints
- **Onboarding**: `npx agentcash onboard` or web at agentcash.dev/onboard
- **Pricing**: Pay-per-request ($0.005-$0.05/call), no subscription
- **Categories**: Research/enrichment, social media, web services, media gen, file hosting, email

---

## AgentCard (CORRECTED 2026-04-10)

**URL**: agentcard.ai (NOT agentcard.sh — that's a different product)
**Built by**: Alchemy
**npm**: `agentcard` (npm install -g agentcard)

- **What**: Prepaid virtual Visa cards for AI agents. CLI-first tool, not a REST API.
- **Auth**: Magic link email flow (no API keys). Token stored in `~/.agentcard/config.json`.
- **Card creation**: NOT a single API call. Requires human Stripe Checkout:
  1. `POST /api/cards/purchase { amountCents }` → returns Stripe Checkout URL
  2. Human pays in browser
  3. Poll `GET /api/cards/purchase/status?session_id=<id>` until complete
  4. `GET /api/cards/<id>/details` → { pan, cvv, expiryMonth, expiryYear, amountCents }
- **Amounts**: $5-$200 in $5 increments
- **Limitation**: US merchants only
- **Integration model**: AI agent reads skill doc at agentcard.ai/skill, runs CLI commands as subprocess
- **Relation to MPP**: AgentCard does NOT use MPP or x402. It's a separate fiat card path. Cards are used directly at merchants that accept Visa.

---

## Jupiter Swap (CORRECTED 2026-04-10)

**v6 is deprecated and being sunset.** Current API is **Swap V2**.

- **Base URL**: `https://api.jup.ag/swap/v2`
- **Flow**: `GET /order` → sign tx → `POST /execute`
- **API key required**: `x-api-key` header (get from developers.jup.ag, free = 1 RPS)
- **Mainnet only**: Jupiter does NOT support Solana devnet
- **Key params**: `inputMint`, `outputMint`, `amount`, `taker` (was `userPublicKey` in v6), `slippageBps`
- `/order` returns `{ transaction, requestId }` — base64 VersionedTransaction
- `/execute` handles broadcasting, confirmation, retries, MEV protection
- `/execute` response: `{ signature, status, outputAmountResult }`

---

## Demo Plan (UPDATED 2026-04-10)

### Verified endpoints:

1. **x402**: `https://www.x402.org/protected`
   - **VERIFIED** — real payment completed (0.01 USDC Solana Devnet)
   - Uses `x402-solana` package, `createX402Client({ wallet, network }).fetch()`
   - Networks: Base Sepolia + Solana Devnet (detector prefers Solana)

2. **MPP**: `https://parallelmpp.dev/api/search`
   - **Detection VERIFIED** — SDK correctly identifies MPP protocol
   - Execution untested (requires Tempo chain funds)
   - Uses `@solana/mpp` + `mppx` for charge flow

3. **L402**: Not available
   - All known endpoints dead (matador.so, sulu.sh, lightning.today)
   - Would need self-hosted Aperture — deprioritized

### Swap path (Jupiter):
- **Mainnet only** — cannot test on devnet
- For demo: either test with tiny mainnet swap ($0.01) or mock response
- Jupiter is a fallback path (only triggers on token mismatch, which most demo scenarios won't hit)

### Verification checklist

- [x] Hit `x402.org/protected` and confirm 402 response shape
- [x] Hit `parallelmpp.dev/api/search` and confirm MPP 402 response shape
- [x] Real x402 payment completed (0.01 USDC, tx confirmed)
- [x] SDK detection works for both x402 v2 header + MPP WWW-Authenticate
- [ ] MPP charge execution (needs Tempo chain funds)
- [ ] Jupiter swap on mainnet (needs API key + small mainnet USDC)
- [ ] L402 endpoint (all dead — deprioritized)
