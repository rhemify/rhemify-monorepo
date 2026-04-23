"use client";

import type { ReactNode } from "react";
import { Linkedin, MessageCircle, Youtube } from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";

const X_URL = "https://x.com/rhemify";

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const linkClass = "block py-1 text-[13px] text-muted transition-colors hover:text-text";
const headingClass = "mb-3 text-[14px] font-semibold tracking-tight text-text";

const productLinks = [
  { href: "#features", label: "Overview" },
  { href: "#pricing", label: "Pricing" },
  { href: "#features", label: "Security" },
  { href: "#features", label: "Integrations" },
];

const developerLinks = [
  { href: "https://docs.rhemify.com", label: "Docs" },
  { href: "#", label: "API Reference" },
  { href: "#", label: "SDKs" },
  { href: "#", label: "Status" },
];

const companyLinks = [
  { href: "#about", label: "About" },
  { href: "#", label: "Careers" },
  { href: "#", label: "Blog" },
  { href: "#", label: "Contact" },
];

const legalLinks = [
  { href: "#", label: "Privacy" },
  { href: "#", label: "Terms" },
  { href: "#", label: "Cookie Policy" },
  { href: "#", label: "Compliance" },
];

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:text-text"
    >
      {children}
    </a>
  );
}

export function Footer() {
  return (
    <footer id="about" className="scroll-mt-24 bg-bg px-8 py-16 text-text md:px-10 lg:px-20">
      <div className="mx-auto w-full max-w-full">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-[1.15fr_0.9fr_0.9fr_0.9fr_0.9fr_1.35fr] lg:gap-10 xl:gap-14">
          <div className="md:col-span-2 lg:col-span-1">
            <ScrollReveal fadeOnly durationMs={860} delayMs={0} className="block">
              <img
                src="/rhemify-logo.svg"
                alt="Rhemify"
                className="h-7 w-auto"
                loading="lazy"
                decoding="async"
              />
            </ScrollReveal>
            <ScrollReveal fadeOnly durationMs={890} delayMs={95} className="mt-4 block">
              <p className="max-w-sm text-[13px] leading-relaxed text-muted">
                The agent capital market.
              </p>
            </ScrollReveal>
          </div>

          <div>
            <ScrollReveal fadeOnly durationMs={820} delayMs={60} className="block">
              <h4 className={headingClass}>Product</h4>
            </ScrollReveal>
            {productLinks.map((item, i) => (
              <ScrollReveal
                key={item.label}
                fadeOnly
                durationMs={800}
                delayMs={110 + i * 40}
                className="block"
              >
                <a href={item.href} className={linkClass}>
                  {item.label}
                </a>
              </ScrollReveal>
            ))}
          </div>

          <div>
            <ScrollReveal fadeOnly durationMs={820} delayMs={80} className="block">
              <h4 className={headingClass}>Developers</h4>
            </ScrollReveal>
            {developerLinks.map((item, i) => (
              <ScrollReveal
                key={item.label}
                fadeOnly
                durationMs={800}
                delayMs={125 + i * 40}
                className="block"
              >
                <a
                  href={item.href}
                  className={linkClass}
                  {...(item.href.startsWith("http")
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {item.label}
                </a>
              </ScrollReveal>
            ))}
          </div>

          <div>
            <ScrollReveal fadeOnly durationMs={820} delayMs={95} className="block">
              <h4 className={headingClass}>Company</h4>
            </ScrollReveal>
            {companyLinks.map((item, i) => (
              <ScrollReveal
                key={item.label}
                fadeOnly
                durationMs={800}
                delayMs={140 + i * 40}
                className="block"
              >
                <a href={item.href} className={linkClass}>
                  {item.label}
                </a>
              </ScrollReveal>
            ))}
          </div>

          <div>
            <ScrollReveal fadeOnly durationMs={820} delayMs={110} className="block">
              <h4 className={headingClass}>Legal</h4>
            </ScrollReveal>
            {legalLinks.map((item, i) => (
              <ScrollReveal
                key={item.label}
                fadeOnly
                durationMs={800}
                delayMs={155 + i * 40}
                className="block"
              >
                <a href={item.href} className={linkClass}>
                  {item.label}
                </a>
              </ScrollReveal>
            ))}
          </div>

          <div className="md:col-span-2 lg:col-span-1">
            <ScrollReveal fadeOnly durationMs={820} delayMs={70} className="block">
              <h4 className={headingClass}>Subscribe to our newsletter</h4>
            </ScrollReveal>
            <ScrollReveal fadeOnly durationMs={800} delayMs={120} className="mt-1 block">
              <p className="text-[13px] leading-relaxed text-muted">
                Get product updates and insights on the agent economy.
              </p>
            </ScrollReveal>
            <ScrollReveal fadeOnly durationMs={800} delayMs={170} className="mt-4 block">
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
                onSubmit={(e) => e.preventDefault()}
              >
                <input
                  type="email"
                  name="email"
                  placeholder="Enter your email"
                  autoComplete="email"
                  className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3.5 text-[13px] text-text placeholder:text-muted-deep outline-none ring-ring/0 transition-[color,box-shadow] focus:border-border-strong focus:ring-2"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  Subscribe
                </button>
              </form>
            </ScrollReveal>
          </div>
        </div>

        <div className="mt-14 flex flex-col-reverse items-start justify-between gap-6 border-t border-border pt-8 sm:flex-row sm:items-center">
          <ScrollReveal fadeOnly durationMs={780} delayMs={40} className="block">
            <p className="text-[12px] text-muted-deep">© 2026 Rhemify. All rights reserved.</p>
          </ScrollReveal>
          <ScrollReveal
            fadeOnly
            durationMs={780}
            delayMs={80}
            className="flex items-center gap-1 sm:gap-0"
          >
            <SocialLink href={X_URL} label="Rhemify on X">
              <XIcon className="h-[18px] w-[18px]" />
            </SocialLink>
            <SocialLink href="#" label="Rhemify on LinkedIn">
              <Linkedin className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </SocialLink>
            <SocialLink href="#" label="Rhemify on YouTube">
              <Youtube className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </SocialLink>
            <SocialLink href="#" label="Rhemify community chat">
              <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </SocialLink>
          </ScrollReveal>
        </div>
      </div>
    </footer>
  );
}
