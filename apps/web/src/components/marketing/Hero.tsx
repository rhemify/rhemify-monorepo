"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/marketing/Button";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { TrustStrip } from "@/components/marketing/TrustStrip";

/** Public file name includes a space and parentheses — encode for a valid URL. */
const ASCII_VIDEO_SRC = "/ascii-animation%20(1).mp4";

/**
 * Parallax speed factor for the hero.
 * 0 = fully pinned (never moves), 1 = scrolls at normal speed.
 * 0.5 = moves at half speed, so the next section "catches up" and covers it.
 */
const PARALLAX_SPEED = 0.5;

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const el = sectionRef.current;
    if (!el) return;

    let rafId = 0;
    let ticking = false;

    const update = () => {
      const offset = window.scrollY * PARALLAX_SPEED;
      el.style.transform = `translate3d(0, ${offset}px, 0)`;
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      rafId = requestAnimationFrame(update);
      ticking = true;
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative z-0 flex min-h-svh flex-col overflow-hidden will-change-transform"
    >
      <div className="pointer-events-none absolute inset-0 z-0 bg-black">
        <video
          className="absolute inset-x-0  h-[118%] w-full object-cover object-[center_55%] motion-reduce:hidden"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        >
          <source src={ASCII_VIDEO_SRC} type="video/mp4" />
        </video>
        {/* <div
          className="absolute inset-0 bg-zinc-950 motion-reduce:block hidden"
          aria-hidden
        /> */}
        <div
          className="absolute inset-0 bg-linear-to-tr from-black/80 via-black/10 to-black/0"
          aria-hidden
        />
        <div className="absolute inset-0 bg-black/45 " aria-hidden />
      </div>

      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col">
        <div className=" flex w-full max-w-4xl flex-1 flex-col md:justify-end justify-center px-8 pb-8 pt-28 md:px-10 md:pb-10 lg:px-20">
          <div className="w-full max-w-full space-y-5 items-center text-center md:text-left md:items-start">
            <ScrollReveal
              fadeOnly
              y={8}
              durationMs={1200}
              delayMs={50}
              revealOnMount
              className="block"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-400/30 bg-zinc-950/40 px-3 py-1 text-[13px] font-medium text-zinc-300 backdrop-blur-sm">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-[#52c390] shadow-[0_0_8px_rgba(82,195,144,0.85)]"
                />
                Agent Execution Runtime
              </span>
            </ScrollReveal>
            <ScrollReveal
              fadeOnly
              x={40}
              durationMs={1580}
              delayMs={180}
              revealOnMount
              className="block"
            >
              <h1 className="w-full max-w-full text-3xl font-bold leading-[1.02] tracking-tight text-white md:text-5xl lg:text-6xl text-center md:text-left">
                Scoped permissions,{" "}
                <span className="text-[#52c390]">enforced policies, and verifiable payment rails</span>{" "}
                for Solana agents.
              </h1>
            </ScrollReveal>
            <ScrollReveal y={14} durationMs={1420} delayMs={420} revealOnMount className="block">
              <p className="text-sm leading-relaxed text-zinc-300 md:leading-relaxed lg:text-[17px]">
                One SDK call detects x402 or MPP, runs your fleet policy, signs a memo on Solana, and captures the full decision trace — replayable forever.
              </p>
            </ScrollReveal>
            <ScrollReveal y={12} durationMs={1280} delayMs={580} revealOnMount className="block">
              <div className="inline-block scroll-mt-28">
                <Button
                  href="/signup"
                  className="h-auto min-h-11 w-[124px] cursor-pointer rounded-md border border-zinc-400/50 bg-zinc-950/55 px-4 py-2 text-sm font-semibold text-white shadow-none backdrop-blur-sm hover:border-zinc-300/60 hover:bg-zinc-900/70 hover:text-white focus-visible:text-white md:w-[148px] md:px-6 md:py-3 md:text-base"
                  aria-label="Get started — onboarding"
                >
                  Get Started
                </Button>
              </div>
            </ScrollReveal>
          </div>
        </div>

        <TrustStrip variant="hero" />
      </div>
    </section>
  );
}
