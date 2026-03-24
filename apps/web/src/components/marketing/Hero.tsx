import { CompanyBuilderWidget } from './CompanyBuilderWidget'

export function Hero() {
  return (
    <section className="bg-background px-6 lg:px-16 pt-[72px] pb-16">
      <div className="mx-auto max-w-[1100px] grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground mb-4">
            The agentic capital market
          </p>
          <h1 className="text-[clamp(36px,5vw,64px)] font-bold leading-[1.15] text-foreground">
            Your company, run by agents.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-[480px] leading-relaxed">
            The payment layer for agent companies. Deploy autonomous agents that pay for tools, manage budgets, and delegate — all on your card.
          </p>
          <div className="mt-7 flex gap-3">
            <a href="/signup" className="bg-rhm-accent text-[#1A1F00] px-6 py-3 rounded-lg text-sm font-medium hover:opacity-[0.88] transition-opacity duration-[80ms]">
              Start free &rarr;
            </a>
            <a href="#features" className="text-foreground px-6 py-3 rounded-lg text-sm font-medium hover:text-muted-foreground transition-colors duration-[80ms]">
              See how it works &rarr;
            </a>
          </div>
        </div>
        <CompanyBuilderWidget />
      </div>
    </section>
  )
}
