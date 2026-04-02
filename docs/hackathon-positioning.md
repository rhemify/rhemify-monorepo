# Rhemos — Hackathon Positioning
## Target: Colosseum Frontier (April 6 - May 11, 2026)

> Route. Govern. Verify. The home of agentic commerce.

## The One-Liner

Rhemos is the verifiable payment layer for agentic commerce — where every agent payment is routed across any standard, governed by fleet-wide policy, and provably recorded on Solana. The permanent source of truth for how autonomous agents spend money.

> Here's proof of what happened, WHY it happened, what alternatives were rejected, and what would have happened if you changed the policy — plus we routed the payment in the first place.

---

## Who Rhemos Serves

Rhemos serves both ends of the market with the same product at different zoom levels.

| | Solo Founder (B2C) | Enterprise (B2B) |
|---|---|---|
| **Their pain** | "My agents are spending money and I have no idea if it's working" | "We can't deploy agents with payment access until legal/compliance signs off" |
| **What "treasury" means to them** | Budget control — "I set $50/day and sleep" | Governance — "Per-agent policies, audit trails, SOC 2 path" |
| **What "intelligence" means to them** | "It tells me which vendors are wasting my money" | "It tells our CFO exactly why every dollar was spent, with replay" |
| **Entry point** | `npx rhemos onboard` + AgentCard ($0 to start) | SDK integration + OWS vault + fleet policy config |
| **Pricing** | Free (3 agents) → Builder ($9/agent) | Team ($49/mo) → Enterprise (custom) |
| **Demo moment that sells** | Agent pays, dashboard shows real-time spend | Decision trace replay — "why did agent-7 pay $340 at 2am?" |

Solo founders onboard in 2 minutes — same playbook as AgentCash's 59k installs. That's the growth engine. Enterprises come through the SDK and stay for governance and intelligence. That's the revenue engine.

---

## Why This Wins

### The Structural Moment

56 of 198 companies in YC W26 are building fully autonomous agents. Every one of them will hit the 402 problem — their agents need to pay for APIs, data, and services on the open internet. The infrastructure layer for agent payments is forming now. But the projects that have won prizes in this space so far are all building **transaction plumbing**. Nobody is building **transaction intelligence**.

The gap: a solo founder's 3 agents overspend on a failing API overnight. An enterprise's 500-agent fleet racks up $47k in API costs and the CFO asks "what did we get for this?" Today, nobody can answer either question. That's the problem Rhemos solves — from 3 agents to 500.

### What Past Winners Got Right (and What They Missed)

| Project | Hackathon | Prize | What They Did | What's Missing |
|---|---|---|---|---|
| **MCPay** | Cypherpunk (Sep 2025) | 1st Stablecoins ($25k) | x402 billing for MCP tools | Single standard. No governance. No intelligence. Process and forget. |
| **Latinum** | Breakout (Apr 2025) | 1st AI ($25k) | MCP-compatible wallet for agent payments | Wallet-based. No multi-standard. No fleet policy. No audit trail. |
| **Mercantill** | Cypherpunk (Sep 2025) | 4th Stablecoins ($10k) | Enterprise banking infra — audit logs + spending controls via Squads multi-sig | Closest to our angle but: on-chain multi-sig (heavy), audit logs only (no decision traces), no standard detection, no replay. |
| **CORBITS.DEV** | Cypherpunk (Sep 2025) | 2nd Infrastructure ($20k) | x402 API proxy + merchant revops dashboard | Merchant-side only. No agent-side intelligence. Single standard. |

**The pattern:** Judges reward agent payment infrastructure. Each successive winner adds a layer — MCPay added x402, Latinum added MCP wallets, Mercantill added governance. **Rhemos is the next logical step: all of the above, plus intelligence that compounds.**

### Why Rhemos Is Structurally Different

**1. Decision Trace Layer — the flight recorder for agent payments**

Every competitor logs WHAT happened (amount, destination, timestamp). Rhemos captures WHY it happened: the agent's task context, the 402 response that triggered payment, which alternative paths were evaluated and rejected, which policy rules fired, the confidence signals on standard detection, and whether the payment led to successful task completion.

This is the difference between a transaction log and a flight recorder. When something goes wrong, operators don't reconstruct — they replay. Given any `payment_trace_id`, Rhemos can reconstruct the exact agent context at the moment of decision and re-run it in a sandbox. Root cause analysis in minutes, not days.

No project in the Colosseum corpus has demonstrated decision replay. This is the demo moment that makes judges say "oh, this is different."

**2. Multi-Standard Routing — the universal adapter**

MCPay is locked to x402. Latinum is wallet-only. The payment standard landscape is fragmenting: x402, MPP, L402, AP2, ACP, Stripe ACS, Visa TAP, Mastercard APC. Every project that bets on one standard gets disrupted by the next one.

Rhemos detects the standard from the 402 response headers and routes automatically. One API call — `pay(resource)` — handles any standard, any chain, any token. As the ecosystem fragments, Rhemos gets stronger. This is the HTTP of agent payments.

**3. Fleet Policy Engine — governance that enterprises require**

Per-agent daily limits, per-transaction ceilings, approval thresholds for human sign-off, domain allowlists, token restrictions, standard whitelists. Every policy rejection returns a structured error the agent can handle gracefully. Every decision (allow or reject) is logged to the intelligence layer.

Mercantill uses Squads multi-sig for spending controls — on-chain, requires multiple signers, heavy. Rhemos enforces policy at the orchestration layer before any transaction touches a chain. Lighter, faster, more granular.

**4. Intelligence That Compounds**

The more payments flow through Rhemos, the smarter it gets:
- **Payment graph memory**: which agents pay which vendors, delegation chains, cost attribution
- **Vendor intelligence**: reliability scores, latency, success rates — auto-built from transaction data
- **Predictive pre-positioning**: after 30 days of data, Rhemos can pre-position funds for agents with recurring payment patterns

Sponge, MCPay, and Latinum process transactions and forget. Rhemos remembers. This is the long-term moat — and the enterprise sales pitch.

---

## The Demo Narrative

The demo should tell a story in five acts. Each act builds on the last. Total runtime: 4-5 minutes.

### Act 1: Zero to Paying (60 seconds)

Show `npx rhemos onboard` — provisions a wallet (OWS vault or Privy), registers a fleet with 3 agents, fires a test `pay()` call to a real 402 endpoint. Agent is live and making its first payment in under 2 minutes. Match AgentCash's onboarding energy.

**Judge takeaway:** "A business owner goes from zero to a governed agent fleet in 2 minutes. This is as easy to adopt as AgentCash, but it's doing more."

### Act 2: Multi-Standard in Action (60 seconds)

Show the same agent hitting three different APIs — one returning x402 headers, one returning MPP, one returning L402. Rhemos detects the standard automatically and routes each payment differently. The agent code is identical: just `rhemos.pay(url)`.

**Judge takeaway:** "This works with any payment standard. Nobody else does that."

### Act 3: The Policy Engine Catches Something (45 seconds)

An agent tries to pay a vendor outside the allowed domain list, or exceeds its daily spend limit. The policy engine blocks the payment, returns a structured rejection, and the agent handles it gracefully. Show the real-time dashboard updating — the blocked payment appears in the live feed with the policy rule that fired.

**Judge takeaway:** "A solo founder sleeps peacefully because the policy engine has their back. A CFO signs off on deployment because every rejection is documented."

### Act 4: The Flight Recorder Moment (90 seconds)

This is the climax. Go to the dashboard and pick a payment from the live feed. Open the decision trace. Show:
- The agent's task context when it made the payment
- The 402 response that triggered it
- Which payment paths were evaluated (AgentCard vs on-chain vs bridge)
- Which policy rules were checked and passed
- The confidence score on standard detection
- Whether the payment led to successful task completion

Then: click "Replay." Rhemos reconstructs the exact state and re-runs the decision in a sandbox. Show how changing one policy variable (raise the threshold, block the domain) changes the outcome.

**Judge takeaway:** "I've never seen this before. This is a flight recorder for autonomous spending."

### Act 5: The Dashboard (45 seconds)

Pull back to the fleet-level view. Stat cards showing total spend, active agents, blocked payments. Agent table with per-agent spend and status. The live feed updating in real-time. The policy editor where operators can adjust rules on the fly.

**Judge takeaway:** "A solo founder sees their 3 agents' spend at a glance. An enterprise sees 500 agents across departments with cost attribution. Same dashboard, different scale. This is production-ready."

---

## Track Positioning

### Primary: Infrastructure

Rhemos is payment orchestration infrastructure that any business — solo founder or enterprise — plugs into via MCP tools or SDK. The multi-standard routing, policy engine, and decision trace layer are infrastructure primitives that the entire agent economy needs.

**Pitch angle:** "The infrastructure layer that turns autonomous agents from expensive black boxes into governable, auditable financial actors — whether you have 3 agents or 500."

### Secondary: Stablecoins

All payment routing runs through stablecoins (USDC primary). Cross-chain bridging via CCTP (Solana to Base) and relay.link. The policy engine governs stablecoin spend across chains.

**Pitch angle:** "The stablecoin routing layer for agent commerce — agents hold USDC, Rhemos figures out how to get it to the right chain in the right format."

### If AI Track Exists

Rhemos is native to AI agent runtimes — ships as MCP tools (`rhemos.pay`, `rhemos.set_policy`, `rhemos.status`) that work in Claude Code, OpenClaw, Codex, and Cursor. No SDK integration required. The intelligence layer is purpose-built for the agent failure analysis problem: 41-87% multi-agent failure rates (UC Berkeley), and the payment decision context is the first thing that evaporates when a context window closes.

---

## Competitive Positioning Matrix

| Dimension | Sponge | MCPay | Latinum | Mercantill | Rhemos |
|---|---|---|---|---|---|
| **Payment model** | Custodial wallet | x402 proxy | MCP wallet | Multi-sig banking | Non-custodial orchestration |
| **Standards** | Single | x402 only | Single | None specified | x402 + MPP + L402 + more |
| **MCP-native** | MCP tool | Yes (x402) | Yes | No | Yes (multi-standard) |
| **Fleet governance** | No | No | Budget only | Multi-sig controls | Full policy engine |
| **Audit/intelligence** | No | No | No | Audit logs | Decision traces + replay |
| **Cross-chain** | No | No | No | No | CCTP + relay.link |
| **Vendor intelligence** | No | No | No | No | Auto-built registry |
| **Data compounds** | No | No | No | No | Yes — every payment trains the system |
| **Session/batched settlement** | No | No | No | No | Squads Smart Account sessions |
| **Subscription awareness** | No | No | No | No | Intel recommends when to stop micropaying |

---

## Key Talking Points for Judges

**If asked "Why not just use subscriptions? Per-call payments are wasteful."**
> We agree — 95% of agent API calls will be covered by subscriptions. Rhemos doesn't replace subscriptions. We route the payments that subscriptions can't cover: the new vendor discovered mid-task, the one-off data pull, the cross-org payment. And for recurring vendors, we use Squads Smart Account sessions with batched 24hr settlement — zero per-call overhead. When our intelligence layer sees an agent paying the same vendor 50 times, we recommend switching to a subscription. We're routing realists, not micropayment maximalists.

**If asked "How is this different from Sponge?"**
> Sponge is a custodial wallet with one payment standard. Rhemos is a non-custodial orchestration runtime that routes across every standard. More importantly, Sponge processes transactions and forgets. Rhemos captures the full decision context — why the agent paid, what alternatives were considered, which policy rules fired — and makes it replayable. Sponge tells you what happened. Rhemos tells you why.

**If asked "How is this different from MCPay?" (the Stablecoins winner)**
> MCPay monetizes MCP tools via x402. It's a billing layer for one standard. Rhemos detects any standard from the 402 response and routes automatically — x402, MPP, L402, and more. MCPay is a payment pipe. Rhemos is a treasury intelligence layer with policy governance, decision tracing, and cross-chain routing.

**If asked "Why not just use AgentCard/AgentCash?"**
> AgentCard issues the card. AgentCash curates the endpoints. Rhemos orchestrates the payment — it decides which instrument to use (AgentCard for fiat, OWS for on-chain), enforces policy before execution, and captures the decision trace. They're complementary layers, not competitors. Rhemos integrates both.

**If asked "Why does the intelligence layer matter?"**
> Gartner projects 40% of agentic AI projects canceled by 2027. Root cause isn't model quality — it's missing memory. When an agent's context window closes, the reasoning behind every payment evaporates. Rhemos's decision trace is the persistent memory that survives context closure. It's the difference between "agent spent $340" and "agent spent $340 on Bloomberg because it was executing a market research task, the x402 endpoint was the cheapest option, and the daily limit still had $660 remaining." That's the compliance story AND the debugging story in one.

**If asked "What's the business model?"**
> Solo founders onboard in 2 minutes with `npx rhemos onboard` — free for 3 agents forever. That's our growth engine, same playbook as AgentCash's 59k installs. As they scale to 4-10 agents, they hit the Builder tier at $9/agent/mo. Enterprises come through the SDK, stay for governance and intelligence, and pay $49/mo base or custom pricing. The volume fee (0.8% above $500/mo in routed spend) aligns our revenue with their usage. Free tier converts to paid because the intelligence layer is what makes their agents cheaper and safer over time.

**If asked "Who's the customer — developers or businesses?"**
> Both, and it's the same product. A solo founder with 3 agents uses `npx rhemos onboard`, sets a budget, and watches the dashboard. An enterprise with 500 agents integrates the SDK, configures fleet policy with per-department overrides, and exports decision traces for SOC 2 audits. The treasury engine, the policy engine, the intelligence layer — all identical. The enterprise just uses more of it.

**If asked "What's the moat?"**
> Data that compounds. Every payment builds the vendor registry (reliability, latency, success rates), the payment graph (who pays whom), and the decision corpus (what works, what fails). After 10k transactions, Rhemos can pre-position funds, recommend cheaper routes, and flag anomalous spending patterns. Competitors that process and forget can't replicate this without rebuilding from scratch. And because we serve both solo founders (volume, data) and enterprises (revenue, retention), the data flywheel spins from day one.

---

## What to Build for the Demo

### Must-Have (Demo Blockers)

1. **MCP server** with `rhemos.pay`, `rhemos.status`, `rhemos.set_policy`, `rhemos.check_policy`
2. **Standard Detector** — parse 402 response headers, identify x402/MPP/L402
3. **Policy engine** — `daily_limit`, `max_per_tx`, `approval_threshold`, `allowed_domains`
4. **Payment event logging** — full schema from day one (payment_events + payment_traces tables)
5. **Decision trace capture** — agent task context, alternatives evaluated, policy rules fired
6. **Dashboard** — live feed, stat cards, agent table, decision trace viewer
7. **`npx rhemos onboard`** — zero-friction setup to first payment

### Should-Have (Strengthens Demo)

8. **Decision replay UI** — given a trace, reconstruct and re-run in sandbox
9. **At least 2 real 402 endpoints** — not mocks, real APIs that return 402
10. **AgentCard integration** — show fiat path alongside crypto path
11. **Cross-chain payment** — one Solana USDC to Base USDC payment via CCTP

### Nice-to-Have (Polish)

12. **Vendor intelligence view** — auto-built from transaction data
13. **Policy editor in dashboard** — edit rules, see immediate effect on next payment
14. **Kill switch** — global fleet pause from dashboard

---

## The Narrative Arc (For Presentation Slides)

1. **The 402 problem is here** — 56 YC W26 companies building autonomous agents, all hitting paywalled APIs. Solo founders and enterprises alike.
2. **Current solutions are payment pipes** — Sponge, MCPay, Latinum process and forget. No governance. No intelligence. No answer for "why did my agents spend $10k last night?"
3. **Businesses need a treasury, not a wallet** — A solo founder needs budget control. An enterprise needs compliance. Both need to know WHY money was spent.
4. **Rhemos is the treasury intelligence layer** — `pay(resource)`, multi-standard, policy engine, decision trace. Same product from 3 agents to 500.
5. **Demo: watch it work** — onboard in 2 minutes, pay across standards, policy blocks a bad payment, flight recorder replays the decision
6. **The business model** — Free tier (3 agents) is the growth engine. Enterprise governance is the revenue engine. Intelligence compounds — every payment makes switching harder.
7. **The team / the ask** — what you're building next, what you need
