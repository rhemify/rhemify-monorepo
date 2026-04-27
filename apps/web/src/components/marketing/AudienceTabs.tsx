"use client";

import { useState } from "react";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Tag } from "@/components/ui/Tag";

const tabs = [
  {
    id: "founders",
    label: "Founders",
    headline: "Ship agents that execute on Ethereum — safely, out of the box.",
    body: "The SDK handles scoped contexts, policy enforcement, and payment rails. You define the intents and risk tiers. Agents do the rest with guardrails built in.",
  },
  {
    id: "web3",
    label: "Web3 teams",
    headline: "x402, MPP, and onchain gas — one SDK primitive.",
    body: "npm install @zhgg/sdk — ExecutionContext, OPA policy engine, Uniswap v3/v4 templates, and ENS identity wired together. Ethereum-native, TypeScript-first.",
  },
  {
    id: "enterprise",
    label: "Enterprise",
    headline: "Signed audit trail. Attenuation guarantee. SOC 2 story.",
    body: "Every action is logged and signed forensically. Sub-agents can only narrow scope — never expand it. Role-based approval queues for HIGH and CRITICAL risk actions at scale.",
  },
];

export function AudienceTabs() {
  const [activeTab, setActiveTab] = useState("founders");
  const current = tabs.find((t) => t.id === activeTab)!;

  return (
    <section
      id="use-cases"
      className="scroll-mt-24 bg-bg px-8 pt-8 pb-24 md:px-10 md:pt-12 md:pb-28 lg:px-20"
    >
      <div className="mx-auto w-full max-w-full text-center">
        <ScrollReveal fadeOnly durationMs={920} delayMs={0} className="flex justify-center">
          <Tag variant="muted">Built for you</Tag>
        </ScrollReveal>
        <ScrollReveal
          fadeOnly
          x={32}
          durationMs={1050}
          delayMs={110}
          className="flex justify-center"
        >
          <h2 className="mt-2 text-[clamp(1.65rem,4vw,2.35rem)] font-bold text-text">
            However you build
          </h2>
        </ScrollReveal>

        <ScrollReveal y={12} durationMs={990} delayMs={190} className="mt-10 flex justify-center">
          <div className="flex w-fit flex-wrap justify-center gap-1 rounded-full border border-border bg-surface/40 p-1 backdrop-blur-sm">
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`cursor-pointer rounded-full px-5 py-2 text-[13px] font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? "bg-accent text-btn-primary-text shadow-sm"
                    : "text-muted hover:text-text"
                }`}
                style={{ transitionDelay: `${i * 20}ms` }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </ScrollReveal>

        <div className="mx-auto mt-10 w-full max-w-full">
          <div key={activeTab} className="quote-swap">
            <h3 className="text-xl font-bold text-text">{current.headline}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{current.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
