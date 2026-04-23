"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@rhemify-monorepo/ui/lib/utils";

const POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";

function scrambleFrame(target: string, progress: number) {
  let out = "";
  for (let i = 0; i < target.length; i++) {
    const c = target[i]!;
    if (c === " ") {
      out += " ";
      continue;
    }
    if (!/[a-zA-Z0-9]/.test(c)) {
      out += c;
      continue;
    }
    const stagger = (i / Math.max(target.length, 1)) * 0.4;
    const end = stagger + 0.55;
    if (progress >= end) {
      out += c;
    } else if (progress < stagger) {
      out += POOL[Math.floor(Math.random() * POOL.length)];
    } else {
      const local = (progress - stagger) / (end - stagger);
      out += Math.random() < local ? c : POOL[Math.floor(Math.random() * POOL.length)];
    }
  }
  return out;
}

type ScrambleTextProps = {
  text: string;
  className?: string;
};

/**
 * Character scramble on hover / focus-in on the parent control (`button` or `a`).
 * Typography matches the parent (“scramble-inherit” style) via explicit inherit utilities.
 */
export function ScrambleText({ text, className }: ScrambleTextProps) {
  const [display, setDisplay] = useState(text);
  const elRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    setDisplay(text);
  }, [text]);

  const cancel = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    runningRef.current = false;
  }, []);

  const play = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    cancel();
    const start = performance.now();
    const duration = 540;

    const tick = (now: number) => {
      const u = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - u) ** 3;
      setDisplay(scrambleFrame(text, eased));
      if (u < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(text);
        runningRef.current = false;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [cancel, text]);

  useEffect(() => {
    const root = elRef.current?.closest("button, a");
    if (!root) return;
    const run = () => play();
    root.addEventListener("mouseenter", run);
    root.addEventListener("focusin", run);
    return () => {
      root.removeEventListener("mouseenter", run);
      root.removeEventListener("focusin", run);
    };
  }, [play]);

  useEffect(() => () => cancel(), [cancel]);

  return (
    <span
      ref={elRef}
      className={cn(
        "relative inline-block overflow-hidden whitespace-nowrap font-[inherit] tracking-[inherit] leading-[inherit] text-inherit [text-transform:inherit]",
        className,
      )}
    >
      <span aria-hidden className="invisible select-none">
        {text}
      </span>
      <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap">
        {display}
      </span>
    </span>
  );
}
