import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { Tag } from "@/components/ui/Tag";

type Step = {
  title: string;
  body: string;
};

const STEPS: readonly Step[] = [
  {
    title: "Onboarding",
    body: "Create agents, set policies, and connect funding.",
  },
  {
    title: "Agents are running",
    body: "Agents discover services, initiate payments, and act on your behalf.",
  },
  {
    title: "Something goes wrong",
    body: "Built-in controls, approvals, and rules protect you and your business.",
  },
  {
    title: "Optimizing the fleet",
    body: "Monitor, analyze, and optimize agent spend and performance.",
  },
] as const;

function StepsColumn() {
  return (
    <ol className="relative flex flex-col">
      {STEPS.map((step, i) => {
        const isLast = i === STEPS.length - 1;
        return (
          <li
            key={step.title}
            className="relative grid grid-cols-[auto_1fr] gap-x-5 pb-10 last:pb-0"
          >
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[13px] top-7 bottom-0 w-px border-l border-dashed border-accent/40"
              />
            )}

            <span className="relative z-10 mt-0.5 flex h-[28px] w-[28px] items-center justify-center rounded-full border border-accent/50 bg-bg text-[12px] font-semibold text-accent">
              {i + 1}
            </span>

            <div className="min-w-0 pt-0.5">
              <p className="text-[15px] font-semibold text-text">{step.title}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{step.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function LifecycleDiagramImage() {
  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-surface/30">
      <img
        src="/lifecycle.png"
        alt="Diagram of the Rhemify stack: you at the top, the Rhemify platform in the center, branching to agents and services with connected capability tiles."
        className="h-auto w-full object-contain"
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}

export function Lifecycle() {
  return (
    <section
      id="lifecycle"
      className="relative z-10 scroll-mt-24 border-t border-border bg-bg px-8 py-24 md:px-10 lg:px-20"
      aria-labelledby="lifecycle-heading"
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex lg:flex-row flex-col justify-center items-center gap-x-10 gap-y-14 ">
          <div className="w-full">
            <ScrollReveal fadeOnly durationMs={920} delayMs={0} className="block">
              <Tag variant="muted">Lifecycle</Tag>
            </ScrollReveal>

            <ScrollReveal y={14} durationMs={1050} delayMs={110} className="block">
              <h2
                id="lifecycle-heading"
                className="mt-5 text-[clamp(1.85rem,3.4vw,2.85rem)] font-bold leading-[1.12] tracking-tight text-text"
              >
                The agent economic lifecycle on Rhemify.
              </h2>
            </ScrollReveal>

            <ScrollReveal fadeOnly durationMs={1020} delayMs={200} className="block">
              <p className="mt-5 max-w-md text-[clamp(1rem,1.3vw,1.15rem)] leading-relaxed text-muted">
                From onboarding to optimization, Rhemify provides the rails for every agent transaction.
              </p>
            </ScrollReveal>

            <ScrollReveal y={16} durationMs={1020} delayMs={280} className="mt-12 block">
              <StepsColumn />
            </ScrollReveal>
          </div>

          <ScrollReveal y={18} durationMs={1150} delayMs={220} className="block">
            <LifecycleDiagramImage />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
