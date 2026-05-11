import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { PricingCard } from "@/components/ui/pricing";

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-24 border-t border-border px-6 py-16 md:py-32">
      <div className="mx-auto max-w-3xl">
        <div className="mx-auto flex max-w-3xl flex-col text-left md:text-center">
          <ScrollReveal fadeOnly x={32} durationMs={1050} delayMs={0} className="block">
            <h2 className="mb-3 text-3xl font-semibold text-text md:mb-4 lg:mb-6 lg:text-4xl">
              Plans made for every agent fleet
            </h2>
          </ScrollReveal>

          <ScrollReveal fadeOnly durationMs={990} delayMs={120} className="block">
            <p className="mb-6 text-muted md:mb-8 lg:mb-12 lg:text-lg">
              Start with a free CEO agent and two departments. Scale to unlimited agents with full
              spend policies when you&apos;re ready.
            </p>
          </ScrollReveal>
        </div>

        <ScrollReveal y={16} durationMs={1120} delayMs={125} className="block">
          <div className="flex flex-col justify-between rounded-xl border border-border p-1">
            <div className="flex flex-col gap-4 md:flex-row">
              <PricingCard
                title="Free"
                price="$0 /month"
                description="Run the SDK against the local stack — full pipeline, no rate limits."
                buttonVariant="outline"
                ctaLabel="Get Started"
                ctaHref="/signup"
                features={[
                  "rhemify.pay for x402 + MPP on Solana",
                  "Local Convex deployment",
                  "All 6 policy rules",
                  "Decision-trace replay (CLI)",
                  "Community support",
                ]}
              />

              <PricingCard
                title="Pro"
                price="$9 /agent /month"
                description="For teams running production agent fleets with audited spend."
                buttonVariant="default"
                highlight
                ctaLabel="Get Started"
                ctaHref="/signup"
                features={[
                  "Unlimited agents",
                  "Per-agent spend policies",
                  "Solana payment execution (memo + roadmap: real USDC transfer)",
                  "Domain + standard allowlists",
                  "Decision-trace replay UI",
                  "Anchor-tx verification (Merkle root on Solana)",
                  "SDK access",
                  "Real-time policy decision feed",
                  "Priority support",
                  "Only active agents are billed",
                ]}
              />
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
