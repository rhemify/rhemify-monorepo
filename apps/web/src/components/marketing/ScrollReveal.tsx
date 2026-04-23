"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  /** Extra delay after element enters viewport */
  delayMs?: number;
  /** Vertical offset in px while hidden (0 = fade-only) */
  y?: number;
  /** Horizontal offset in px while hidden. Positive = starts right of final position (slides left on reveal). */
  x?: number;
  /** Shorthand: sets y to 0 */
  fadeOnly?: boolean;
  /** Transition duration in ms */
  durationMs?: number;
  /** Animate immediately on first paint instead of waiting for scroll */
  revealOnMount?: boolean;
};

export function ScrollReveal({
  children,
  className = "",
  delayMs = 0,
  y: yProp,
  x: xProp,
  fadeOnly = false,
  durationMs = 1380,
  revealOnMount = false,
}: ScrollRevealProps) {
  const y = fadeOnly ? 0 : (yProp ?? 14);
  const x = xProp ?? 0;
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const reveal = () => requestAnimationFrame(() => setVisible(true));
    const el = ref.current;
    if (!el) return;

    if (revealOnMount) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      reveal();
      return;
    }

    // Fallback for above-the-fold content: if already in view on load, reveal immediately.
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const isInInitialViewport = rect.top < viewportHeight * 0.95 && rect.bottom > 0;
    if (isInInitialViewport) {
      reveal();
      return;
    }

    // Only offscreen elements should be hidden before their reveal.
    setVisible(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          reveal();
          observer.unobserve(el);
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -5% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [revealOnMount]);

  return (
    <div
      ref={ref}
      data-scroll-reveal
      data-reveal-on-mount={revealOnMount ? "" : undefined}
      className={`will-change-[opacity,transform] motion-reduce:opacity-100 ${
        revealOnMount ? "" : visible ? "opacity-100" : "opacity-0"
      } ${className}`}
      style={{
        ...(revealOnMount
          ? {
              ["--scroll-reveal-y" as string]: fadeOnly ? "0px" : `${y}px`,
              ["--scroll-reveal-x" as string]: `${x}px`,
            }
          : {}),
        transform: revealOnMount
          ? "translate3d(0,0,0)"
          : visible
            ? "translate3d(0,0,0)"
            : `translate3d(${x}px,${y}px,0)`,
        transitionProperty: revealOnMount ? undefined : "opacity, transform",
        transitionDuration: revealOnMount ? undefined : `${durationMs}ms`,
        transitionTimingFunction: revealOnMount ? undefined : "cubic-bezier(0.22, 1, 0.36, 1)",
        transitionDelay: revealOnMount ? undefined : visible ? `${delayMs}ms` : "0ms",
        animationName: revealOnMount
          ? fadeOnly && x === 0
            ? "hemi-fade-soft"
            : "hemi-rise-in"
          : undefined,
        animationDuration: revealOnMount ? `${durationMs}ms` : undefined,
        animationTimingFunction: revealOnMount ? "cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
        animationDelay: revealOnMount ? `${delayMs}ms` : undefined,
        animationFillMode: revealOnMount ? "both" : undefined,
      }}
    >
      {children}
    </div>
  );
}
