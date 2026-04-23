"use client";

import { useEffect, useRef, useState } from "react";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

type StatDef = {
  label: string;
  end: number;
  format: (n: number) => string;
};

const STATS: readonly StatDef[] = [
  { label: "Agent-settled volume", end: 186, format: (n) => `$${Math.round(n)}M+` },
  { label: "Autonomous wallets", end: 72, format: (n) => `${Math.round(n)}K+` },
  { label: "Live integrations", end: 120, format: (n) => `${Math.round(n)}+` },
  {
    label: "Machine-native payments",
    end: 9.4,
    format: (n) => `${(Math.round(Math.min(n, 9.4) * 10) / 10).toFixed(1)}M+`,
  },
] as const;

const COUNT_DURATION_MS = 3400;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function StatCountUp({
  end,
  format,
  startDelayMs,
  reduceMotion,
  active,
}: {
  end: number;
  format: (n: number) => string;
  startDelayMs: number;
  reduceMotion: boolean;
  active: boolean;
}) {
  const [text, setText] = useState(() => format(0));

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let raf = 0;

    if (reduceMotion) {
      const delayId = window.setTimeout(() => {
        if (!cancelled) setText(format(end));
      }, startDelayMs);
      return () => {
        cancelled = true;
        window.clearTimeout(delayId);
      };
    }

    const delayId = window.setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const elapsed = now - start;
        const t = Math.min(1, elapsed / COUNT_DURATION_MS);
        const eased = easeOutCubic(t);
        setText(format(end * eased));
        if (t < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          setText(format(end));
        }
      };
      raf = requestAnimationFrame(tick);
    }, startDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(delayId);
      cancelAnimationFrame(raf);
    };
  }, [active, end, format, startDelayMs, reduceMotion]);

  return <span className="inline-block tabular-nums">{text}</span>;
}

export function StatsSection() {
  const listRef = useRef<HTMLUListElement>(null);
  const [listVisible, setListVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof window === "undefined") return;

    if (!("IntersectionObserver" in window)) {
      setListVisible(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setListVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      className="relative z-10 w-full border-t border-border bg-bg px-8 py-16 md:px-10 lg:px-20 lg:py-20"
      aria-labelledby="stats-heading"
    >
      <div className="mx-auto flex w-full max-w-full flex-col">
        <ScrollReveal fadeOnly x={32} durationMs={920} delayMs={0} className="block text-center">
          <p
            id="stats-heading"
            className="mx-auto w-full max-w-full text-xl font-semibold leading-snug tracking-tight text-text"
          >
            Infrastructure you can trust.{" "}
            <span className="text-muted">Outcomes you can verify.</span>
          </p>
        </ScrollReveal>

        <ul
          ref={listRef}
          className="mt-12 grid w-full grid-cols-2 gap-x-6 gap-y-10 lg:mt-14 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-12"
        >
          {STATS.map((stat, i) => {
            const startDelayMs = 90 + i * 75;
            return (
              <li key={stat.label} className="min-w-0 text-center lg:text-left">
                <ScrollReveal
                  fadeOnly
                  durationMs={900}
                  delayMs={startDelayMs}
                  className="flex flex-col items-center justify-center"
                >
                  <p className="text-4xl md:text-5xl lg:text-7xl font-extralight tracking-tight text-accent">
                    <StatCountUp
                      end={stat.end}
                      format={stat.format}
                      startDelayMs={startDelayMs}
                      reduceMotion={reduceMotion}
                      active={listVisible}
                    />
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-muted">{stat.label}</p>
                </ScrollReveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
