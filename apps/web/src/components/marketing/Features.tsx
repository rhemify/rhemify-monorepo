import { ScrollReveal } from '@/components/marketing/ScrollReveal'

const transactions = [
  { agent: 'research-001', vendor: 'perplexity.ai', cost: '$0.004', method: 'x402' },
  { agent: 'marketing-003', vendor: 'buffer.com', cost: '$0.12', method: 'direct' },
  { agent: 'research-001', vendor: 'tavily.com', cost: '$0.002', method: 'x402' },
]

function SectionHeader() {
  return (
    <div className="text-center mb-16">
      <p className="font-mono text-xs uppercase text-muted-foreground tracking-[0.1em] mb-2">HOW IT WORKS</p>
      <h2 className="text-[clamp(28px,5vw,38px)] font-bold mb-3">One fleet. Full control.</h2>
      <p className="text-[17px] text-muted-foreground max-w-[520px] mx-auto leading-[1.7]">
        Deploy agents that act autonomously — with guardrails you define and spending you can see.
      </p>
    </div>
  )
}

function PaymentsVisual() {
  return (
    <div className="bg-background rounded-xl border-[0.5px] border-border p-6">
      <div className="space-y-4">
        {transactions.map((tx, i) => (
          <div key={i} className="flex items-center justify-between font-mono text-xs text-muted-foreground">
            <span>{tx.agent} → {tx.vendor}</span>
            <span className="text-rhm-accent-dark">{tx.cost} · {tx.method}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PoliciesVisual() {
  return (
    <div className="bg-background rounded-xl border-[0.5px] border-border p-6 space-y-5">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-xs text-muted-foreground">Research dept</span>
          <span className="font-mono text-sm">$12.40 / $50.00</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full w-full">
          <div className="h-full bg-rhm-accent rounded-full" style={{ width: '25%' }} />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-xs text-muted-foreground">Marketing dept</span>
          <span className="font-mono text-sm">$38.00 / $50.00</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full w-full">
          <div className="h-full bg-rhm-warning rounded-full" style={{ width: '76%' }} />
        </div>
      </div>
    </div>
  )
}

function DelegationVisual() {
  return (
    <div className="bg-background rounded-xl border-[0.5px] border-border p-6">
      <div className="font-mono text-sm overflow-x-auto">
        <div className="min-w-[280px]">
          <div className="text-center mb-3">⬡ CEO</div>
          <div className="text-center text-muted-foreground mb-3">│</div>
          <div className="text-center text-muted-foreground mb-3">├──────────┼──────────┤</div>
          <div className="flex justify-between px-4">
            <span>◈ Research</span>
            <span>◫ Marketing</span>
            <span>◧ Engineering</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureRow({
  overline,
  headline,
  body,
  visual,
  reversed,
}: {
  overline: string
  headline: string
  body: string
  visual: React.ReactNode
  reversed?: boolean
}) {
  return (
    <ScrollReveal>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-16">
        <div className={reversed ? 'lg:order-2' : ''}>
          <p className="font-mono text-xs uppercase text-muted-foreground tracking-[0.1em] mb-2">{overline}</p>
          <h3 className="text-2xl font-bold mb-3">{headline}</h3>
          <p className="text-[15px] text-muted-foreground leading-[1.7] max-w-[420px]">{body}</p>
        </div>
        <div>{visual}</div>
      </div>
    </ScrollReveal>
  )
}

export function Features() {
  return (
    <section id="features" className="bg-white py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader />

        <FeatureRow
          overline="PAYMENTS"
          headline="Agents pay with your card"
          body="Every agent gets delegated access to your payment method. Set per-agent budgets, daily limits, and approved vendors. Every charge is logged in real time."
          visual={<PaymentsVisual />}
        />

        <FeatureRow
          overline="POLICIES"
          headline="Budgets that enforce themselves"
          body="Define spend policies per agent, per department, per vendor. When limits hit, agents freeze automatically. No surprises."
          visual={<PoliciesVisual />}
          reversed
        />

        <FeatureRow
          overline="DELEGATION"
          headline="Agents that hire agents"
          body="Your CEO agent delegates tasks to department agents. Research calls Marketing. Marketing calls Engineering. A mesh of autonomous work."
          visual={<DelegationVisual />}
        />
      </div>
    </section>
  )
}
