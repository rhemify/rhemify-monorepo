import type { ReactNode } from "react";

import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Tag } from "@/components/ui/Tag";

const FEATURE_IMAGE_DIMS = { width: 1232, height: 928 } as const;

function FeatureVisualImage({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-surface/40">
      <img
        src={src}
        alt={alt}
        width={FEATURE_IMAGE_DIMS.width}
        height={FEATURE_IMAGE_DIMS.height}
        className="h-auto w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}

function SectionHeader() {
  return (
    <div className="mb-16 text-center">
      <ScrollReveal fadeOnly durationMs={920} delayMs={0} className="flex justify-center">
        <Tag variant="muted">How it works</Tag>
      </ScrollReveal>
      <ScrollReveal fadeOnly x={32} durationMs={1050} delayMs={110} className="flex justify-center">
        <h2 className="mt-2 text-[clamp(1.65rem,4vw,2.35rem)] font-bold text-text">
          One fleet. Full control.
        </h2>
      </ScrollReveal>
      <ScrollReveal fadeOnly durationMs={1020} delayMs={200} className="flex justify-center">
        <p className="mt-3 w-full max-w-full text-[17px] leading-relaxed text-muted">
          Deploy agents that act autonomously — with guardrails you define and spending you can see.
        </p>
      </ScrollReveal>
    </div>
  );
}

function FeatureRow({
  overline,
  headline,
  body,
  visual,
  reversed,
  staggerBase,
}: {
  overline: string;
  headline: string;
  body: string;
  visual: ReactNode;
  reversed?: boolean;
  staggerBase: number;
}) {
  return (
    <div className="mb-20 grid grid-cols-1 items-start gap-12 last:mb-0 lg:grid-cols-2 lg:gap-x-16 lg:gap-y-14 max-w-7xl mx-auto">
      <div className={`w-full space-y-1 ${reversed ? "lg:order-2" : ""}`}>
        <ScrollReveal fadeOnly durationMs={920} delayMs={staggerBase} className="block">
          <p className="font-mono text-[13px] font-medium uppercase tracking-[0.12em] text-muted-deep sm:text-sm">
            {overline}
          </p>
        </ScrollReveal>
        <ScrollReveal y={14} durationMs={1050} delayMs={staggerBase + 110} className="block">
          <h3 className="mt-3 text-[clamp(1.85rem,3.4vw,2.85rem)] font-bold leading-[1.12] tracking-tight text-text">
            {headline}
          </h3>
        </ScrollReveal>
        <ScrollReveal fadeOnly durationMs={1020} delayMs={staggerBase + 200} className="block">
          <p className="mt-5 w-full max-w-full text-[clamp(1.05rem,1.5vw,1.35rem)] leading-relaxed text-muted">
            {body}
          </p>
        </ScrollReveal>
      </div>
      <ScrollReveal
        y={18}
        durationMs={1150}
        delayMs={staggerBase + 145}
        className={reversed ? "lg:order-1" : ""}
      >
        {visual}
      </ScrollReveal>
    </div>
  );
}

export function Features() {
  return (
    <section
      id="features"
      className="relative z-10 scroll-mt-24 border-t border-border bg-[#0A0A0B] px-8 py-24 md:px-10 lg:px-20"
    >
      <div className="mx-auto w-full max-w-full">
        <SectionHeader />

        <FeatureRow
          staggerBase={0}
          overline="// Payments"
          headline="Agents pay with your card"
          body="Every agent gets delegated access to your payment method. Set per-agent budgets, daily limits, and approved vendors. Every charge is logged in real time."
          visual={
            <FeatureVisualImage
              src="/payments.png"
              alt="Stylized digital payment card formed from glowing data streams, representing agent transactions and card spend."
            />
          }
        />

        <FeatureRow
          staggerBase={65}
          overline="// Policies"
          headline="Budgets that enforce themselves"
          body="Define spend policies per agent, per department, per vendor. When limits hit, agents freeze automatically. No surprises."
          reversed
          visual={
            <FeatureVisualImage
              src="/policies.png"
              alt="Abstract visualization of teams in VR headsets formed from code, representing enforced spend policies and guardrails."
            />
          }
        />

        <FeatureRow
          staggerBase={130}
          overline="// Delegation"
          headline="Agents that hire agents"
          body="Your CEO agent delegates tasks to department agents. Research calls Marketing. Marketing calls Engineering. A mesh of autonomous work."
          visual={
            <FeatureVisualImage
              src="/delegation.png"
              alt="Leaders gathered around a glowing data surface, illustrating hierarchical agent delegation and collaboration."
            />
          }
        />
      </div>
    </section>
  );
}
