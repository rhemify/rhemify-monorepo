"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/marketing/Button";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

const links = [
  { href: "#features", label: "Product" },
  { href: "#use-cases", label: "Use Cases" },
  { href: "#pricing", label: "Pricing" },
  { href: "https://docs.rhemify.com", label: "Docs" },
  { href: "#about", label: "About" },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <nav className="fixed top-0 right-0 left-0 z-50">
      <div className="relative z-[60] mx-auto flex h-24 max-w-full items-center justify-between px-8 md:px-10 lg:px-20">
        <ScrollReveal fadeOnly durationMs={900} delayMs={0} className="flex shrink-0">
          <a href="/" className="flex items-center py-1">
            <img
              src="/rhemify-logo.svg"
              alt="Rhemify"
              className="h-[26px] w-auto md:h-7"
              loading="lazy"
              decoding="async"
            />
          </a>
        </ScrollReveal>

        <div className="flex items-center gap-6 md:gap-8">
          <div className="hidden items-center gap-8 md:flex">
            {links.map((link, i) => (
              <ScrollReveal
                key={link.href}
                fadeOnly
                durationMs={900}
                delayMs={65 + i * 70}
                className="flex"
              >
                <a
                  href={link.href}
                  className="text-[13px] font-medium tracking-wide text-zinc-200/90 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              </ScrollReveal>
            ))}
          </div>
          <ScrollReveal
            fadeOnly
            durationMs={900}
            delayMs={65 + links.length * 70}
            className="hidden md:flex"
          >
            <Button
              href="/signup"
              className="rounded-lg border border-white/25 bg-white/10 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/15"
            >
              Get Started
            </Button>
          </ScrollReveal>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/25 text-white md:hidden"
            aria-expanded={isOpen}
            aria-controls="mobile-nav-panel"
            aria-label={isOpen ? "Close menu" : "Open menu"}
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div
          id="mobile-nav-panel"
          className="fixed inset-x-0 bottom-0 top-24 z-[55] bg-black/95 backdrop-blur-xl md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative mx-auto max-h-[calc(100dvh-6rem)] w-full max-w-lg overflow-y-auto overscroll-contain px-8 pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom,0px))] md:px-10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-0.5">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg px-1 py-2.5 text-[15px] text-zinc-200 hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </div>
            <Button
              href="/signup"
              onClick={() => setIsOpen(false)}
              className="mt-6 w-full shrink-0 rounded-lg border border-white/25 bg-white/10 px-4 py-3.5 text-[15px] font-semibold text-white hover:bg-white/15"
            >
              Get Started
            </Button>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
