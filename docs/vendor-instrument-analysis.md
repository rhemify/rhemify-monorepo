# Rhemify — Vendor & Instrument Integration Map

## Solana-Native Services That Integrate With Rhemify

Comprehensive map of every external service, protocol, and instrument Rhemify can plug into — organized by role in the stack.

---

## 1. Signing Layer (Who Holds the Keys)

| Service | What It Does | How It Fits in Rhemify | Phase |
|---|---|---|---|
| **OWS (Open Wallet Standard)** | Local-first encrypted vault. BIP-39 seed derives Solana, EVM, Bitcoin, TON, Cosmos addresses. AES-256-GCM. Zero network calls. 21 founding orgs (Circle, Virtuals, Solana Foundation). | Primary signing backend for self-hosted/developer/enterprise deployments. Free, no per-tx cost, key never leaves device. | 1 |
| **Privy** | Cloud-hosted embedded wallets. Key sharding in TEEs. SOC 2 compliant. Email/SMS/social onboarding. Supports EVM, Solana, Bitcoin. | Cloud signing backend for SaaS/fiat-first customers. Agents get scoped session keys. Revocable per-agent. | 1 |
| **Squads Smart Accounts** | Programmable smart accounts on Solana. On-chain spending policies, time locks, policy-scoped signers. Audited by OtterSec, formally verified by Certora. MPP spec supports Squads as session payment type. | **Two roles:** (1) Enterprise multi-sig for high-value fleets (M-of-N approval). (2) **Session-based payments** — open a Squads account per vendor with budget + 24hr cooldown, give agent a policy-scoped signer, zero per-call overhead, batched settlement. Solves the micropayment overhead criticism entirely. | 1 |
| **TipLink** | Google-login wallets via links. API-driven wallet generation. Solana-native. | Agent provisioning for zero-friction onboarding. Create a wallet for each agent with one API call. No seed phrase, no extension. | 2 |

---

## 2. Payment Instruments (What Agents Pay With)

| Instrument | What It Does | How It Fits in Rhemify | Phase |
|---|---|---|---|
| **AgentCard** | Virtual Visa cards for agents. Fiat-first. Per-agent cards with spend limits. $0 to start. Real-time tracking. | Fiat payment path. When server accepts MPP Shared Payment Token, Rhemify wraps AgentCard details in MPP PaymentIntent. Agent never handles card numbers. | 1 |
| **AgentCash** | Curated API marketplace. 338+ endpoints. x402 payments. 59k+ installs. Enrichment, social data, email, travel, file uploads. | Vendor discovery layer. Seed 338 endpoints into Rhemify vendor_registry on Day 1. Route through AgentCash when target endpoint is in their registry. | 1 |
| **USDC (Solana SPL)** | Native stablecoin on Solana. Highest liquidity. | Primary on-chain payment token. Direct transfers for x402/MPP endpoints on Solana. | 1 |
| **USDC (Base/ETH)** | USDC on EVM chains. | Cross-chain payment token. Bridge from Solana via CCTP when vendor is on EVM. | 1 |
| **SOL** | Native Solana token. | Gas payments. Some x402 endpoints may accept SOL directly. | 1 |
| **Lightning (sats)** | Bitcoin Lightning Network. L402 (formerly LSAT) payment standard. | L402 payment path. Wraps LND/CLN client for instant micropayments. | 1 |
| **Squads Session (MPP)** | Squads Smart Account with on-chain spending policy. Budget + cooldown + policy-scoped signer. | Session-based payment for recurring vendors. Zero per-call tx cost. Intelligence layer auto-opens sessions when it detects 5+ payments to same vendor in 24hr. Batched settlement once per cooldown period. | 1 |

---

## 3. DeFi / Swap Layer (Token Conversion)

| Service | What It Does | How It Fits in Rhemify | Phase |
|---|---|---|---|
| **Jupiter** | Solana's dominant swap aggregator. Swap API, limit orders, DCA. Routes across all Solana DEXes for best price. | Same-chain swap. When agent holds Token A but vendor wants Token B on Solana, Jupiter handles the swap before payment. Path Resolver calls Jupiter quote API to score swap cost. | 1 |
| **Orca** | Solana DEX. Concentrated liquidity AMM (Whirlpools). | Backup swap path. Jupiter aggregates Orca, but direct Orca integration for specific pools may be cheaper. | 2 |
| **Raydium** | Solana DEX + AMM. | Same as Orca — aggregated by Jupiter, direct integration for specific cases. | 2 |

---

## 4. Bridge Layer (Cross-Chain Movement)

| Service | What It Does | How It Fits in Rhemify | Phase |
|---|---|---|---|
| **CCTP (Circle)** | Native USDC burn-and-mint across 20+ chains. Solana ↔ Base, ETH, Arbitrum, etc. No wrapped tokens. Fast transfer = faster-than-finality settlement. No protocol fee (only gas). | Primary bridge. When agent holds Solana USDC but vendor is on Base/ETH, CCTP handles the bridge. ~5s standard, faster with fast transfer. | 1 |
| **relay.link** | EVM ↔ EVM bridge. 5-20bps fee. Flexible routing. | Secondary bridge for EVM-to-EVM transfers. When vendor is on Arbitrum but agent holds ETH USDC. | 2 |
| **Wormhole** | Cross-chain messaging + token bridge. Solana, EVM, Cosmos, Sui. | Alternative bridge for non-USDC tokens or chains CCTP doesn't cover. | 3 |

---

## 5. RPC / Infrastructure Layer (How Agents Talk to Chains)

| Service | What It Does | How It Fits in Rhemify | Phase |
|---|---|---|---|
| **Helius** | Solana RPC, webhooks, DAS API, transaction sending (Sender), data streaming (LaserStream). 99.99% success rate. SOC 2. | Primary Solana RPC. Helius Sender for low-latency transaction delivery. Webhooks for on-chain payment confirmation. LaserStream for real-time event monitoring. | 1 |
| **Triton (Yellowstone gRPC)** | High-performance Solana data streaming. gRPC-based. | Alternative to Helius for high-throughput event streaming. Useful for fleet-scale payment monitoring. | 2 |
| **QuickNode** | Multi-chain RPC. Solana, EVM, Bitcoin. | Multi-chain RPC provider. One provider for all chain interactions. | 2 |

---

## 6. Identity / Communication Layer

| Service | What It Does | How It Fits in Rhemify | Phase |
|---|---|---|---|
| **Privy (Auth)** | Email/SMS/social login → embedded wallet. Agent gets an identity without seed phrase. | Agent identity for non-technical onboarding. Each agent gets an email-linked identity + wallet in one step. | 1 |
| **Dialect (Blinks + Alerts)** | Solana Actions/Blinks for one-click transactions. Real-time alerts. 600+ Blinks across protocols. | Operator notifications. Dialect alerts for spend anomalies, vendor blocks, policy breaches. Blinks for one-click approval of queued payments. | 2 |
| **Solana Name Service (SNS)** | .sol domain names for Solana addresses. | Agent identity. agent-7.rhemify.sol as a human-readable identity for each agent in the fleet. | 3 |
| **ERC-8004 (Trustless Agents)** | On-chain identity + reputation + validation registries for agents. EVM-based (ERC-721). | Cross-chain agent identity. Read ERC-8004 reputation data to inform Rhemify intelligence layer. Write Rhemify vendor scores back to on-chain registry. | 3 |

---

## 7. Agent Sourcing Layer (Where Agents Come From)

| Service | What It Does | How It Fits in Rhemify | Phase |
|---|---|---|---|
| **OpenClaw** | Open-source local-first agent runtime. 250k+ GitHub stars. MCP-native. | Primary agent runtime for demos and self-hosted deployments. Rhemify ships as MCP server config. | 1 |
| **Claude Code** | Anthropic's CLI agent. MCP tool support. | High developer adoption. Same MCP integration as OpenClaw. | 1 |
| **Codex / Cursor** | OpenAI and IDE agents. MCP-compatible. | Additional runtime support via MCP. | 1 |
| **CrewAI** | Multi-agent collaboration framework. | SDK integration. Each crew member = Rhemify agent with own policy. | 2 |
| **ADGP (Virtuals Protocol)** | Agent marketplace on Base. Tokenized agents. ACP (Agent Commerce Protocol) for agent-to-agent payments. Butler as orchestration layer. | Agent hiring. Operators could browse and deploy Virtuals agents, wrapped with Rhemify fleet governance. ACP becomes another payment standard in Standard Detector. | 3 |
| **XAAM** | Decentralized agent marketplace. MCP-native. Agents share capabilities. | Alternative agent marketplace. Agents discovered via XAAM can be wrapped with Rhemify policy + intelligence. | 3 |

---

## 8. Data / Observability Layer

| Service | What It Does | How It Fits in Rhemify | Phase |
|---|---|---|---|
| **Supabase Realtime** | Real-time WebSocket subscriptions for PostgreSQL. | Live feed for operator dashboard. Payment events → Supabase → WebSocket → dashboard. | 1 |
| **AgentOps** | Agent observability. Traces agent execution, errors, latency. | Complementary — AgentOps monitors agent behavior, Rhemify monitors agent payments. Could share trace context. | 2 |
| **Solana FM / Solscan** | Block explorers. Transaction history, account details. | Link from Rhemify payment events to on-chain explorer for transaction verification. | 1 |

---

## Integration Priority for Frontier (5 weeks)

### Must Integrate (Demo Blockers)

| Service | Why |
|---|---|
| **OWS** | Signing backend for self-hosted agents. Non-custodial story. |
| **Privy** | Cloud signing for fiat-first onboarding. Email login → wallet. |
| **AgentCard** | Fiat payment path. Shows agents can pay traditional APIs too. |
| **AgentCash** | 338 endpoints seeded into vendor registry. Instant vendor coverage. |
| **USDC (Solana)** | Primary on-chain payment. x402 endpoints. |
| **Helius** | Solana RPC + transaction delivery. |
| **Jupiter** | Token swap when agent holds wrong token. |
| **CCTP** | Cross-chain USDC bridge. Solana → Base. |
| **OpenClaw** | Primary agent runtime for demo. |

### Should Integrate (Strengthens Demo)

| Service | Why |
|---|---|
| **Squads Smart Accounts** | Session-based payments for recurring vendors. Solves micropayment overhead criticism. MPP session payment type. On-chain spending policies. **Upgraded from Phase 2 — now a key demo differentiator.** |
| **TipLink** | Zero-friction agent wallet provisioning. |
| **Dialect** | Real-time operator alerts via Blinks. |
| **Lightning (LND)** | L402 payment standard support. |

### Future Integrations (Post-Hackathon)

| Service | Why |
|---|---|
| **ADGP (Virtuals)** | Agent hiring marketplace + ACP standard. |
| **ERC-8004** | On-chain agent identity + reputation. |
| **Wormhole** | Additional bridge coverage. |
| **XAAM** | Agent marketplace. |
| **SNS** | .sol naming for fleet agents. |
