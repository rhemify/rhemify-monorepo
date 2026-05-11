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
          The execution infrastructure agents are missing.
        </h2>
      </ScrollReveal>
      <ScrollReveal fadeOnly durationMs={1020} delayMs={200} className="flex justify-center">
        <p className="mt-3 w-full max-w-full text-[17px] leading-relaxed text-muted">
          Standard detection, policy enforcement at the call layer, and verifiable trace anchoring — so agents can pay safely and verifiably on Solana.
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
      className="relative z-10 scroll-mt-24 border-t border-border bg-bg px-8 py-24 md:px-10 lg:px-20"
    >
      <div className="mx-auto w-full max-w-full">
        <SectionHeader />

        <FeatureRow
          staggerBase={0}
          overline="// Payment Rails"
          headline="One call. x402 or MPP detected. Memo-anchored on Solana."
          body="rhemify.pay(url) detects the standard from the HTTP 402 response, runs the fleet policy, signs a memo transaction on Solana, and replays the resource with the proof. The runtime picks the rail per call — you don't wire it."
          visual={
            <FeatureVisualImage
              src="/payments.png"
              alt="Stylized digital payment card formed from glowing data streams, representing agent transactions and card spend."
            />
          }
        />

        <FeatureRow
          staggerBase={65}
          overline="// Policy Engine"
          headline="Six named rules. Enforced before any tx is signed."
          body="daily_limit, max_per_transaction, domain_allowlist, standard_allowlist, vendor_blocked, approval_threshold — evaluated client-side against the policy your fleet sets. Prompt injection can't bypass it because the constraint lives in the execution layer, not the prompt."
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
          overline="// Decision Replay"
          headline="What if our daily limit had been $1? Re-run the trace and see."
          body="Every payment captures the full decision context — detection raw body, alternative paths scored, rules fired, agent spend. Override any policy variable and the Go replay engine re-evaluates against the snapshot. The audit-grade primitive: not just what your agent did, but why — and what it would have done under different policy."
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
