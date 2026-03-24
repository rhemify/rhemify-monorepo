const features = [
  { text: 'CEO agent always included', free: true },
  { text: '2 departments on free tier', free: true },
  { text: 'Real-time transaction feed', free: false },
  { text: 'Per-agent spend policies', free: false },
  { text: 'Multi-chain payments', free: false },
  { text: 'SDK access', free: false },
]

function FreeBadge() {
  return (
    <span className="bg-rhm-accent-tint text-rhm-accent-dark font-mono text-[10px] px-[7px] py-[2px] rounded ml-1.5">
      free
    </span>
  )
}

export function Pricing() {
  return (
    <section id="pricing" className="bg-white py-24">
      <div className="max-w-5xl mx-auto px-6 text-center">
        <p className="font-mono text-xs uppercase text-muted-foreground tracking-[0.1em] mb-2">PRICING</p>
        <h2 className="text-[clamp(28px,5vw,38px)] font-bold mb-3">Simple, per-agent pricing</h2>
        <p className="text-base text-muted-foreground">No platform fees. No hidden costs. Cancel anytime.</p>

        <div className="max-w-[400px] mx-auto mt-8">
          <div className="bg-background rounded-xl border-[0.5px] border-border p-10 text-left">
            <div>
              <span className="text-5xl font-bold">$9.00</span>
              <span className="text-base text-muted-foreground font-normal">/agent/mo</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Only active agents are billed. Pause anytime.</p>

            <div className="border-t-[0.5px] border-border mt-6 pt-5">
              <div className="space-y-3">
                {features.map((feature) => (
                  <div key={feature.text} className="text-sm text-foreground">
                    <span className="text-rhm-accent-dark mr-2">✓</span>
                    {feature.text}
                    {feature.free && <FreeBadge />}
                  </div>
                ))}
              </div>
            </div>

            <button className="bg-rhm-accent text-[#1A1F00] w-full py-3 rounded-lg text-sm font-medium hover:opacity-[0.88] transition-opacity mt-6 cursor-pointer">
              Start free →
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
