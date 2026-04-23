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
                description="Kick the tires with a single CEO agent and two departments."
                buttonVariant="outline"
                ctaLabel="Get Started"
                ctaHref="/signup"
                features={[
                  "CEO agent always included",
                  "2 department agents",
                  "Real-time transaction feed",
                  "Basic spend guardrails",
                  "Community support",
                ]}
              />

              <PricingCard
                title="Pro"
                price="$9 /agent /month"
                description="For teams running production agent fleets with full delegation."
                buttonVariant="default"
                highlight
                ctaLabel="Get Started"
                ctaHref="/signup"
                features={[
                  "Unlimited agents & departments",
                  "Per-agent spend policies",
                  "Multi-chain payments",
                  "Approved vendors & daily limits",
                  "Agent-to-agent delegation",
                  "SDK access",
                  "Real-time audit logs",
                  "Auto-freeze on policy breach",
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
