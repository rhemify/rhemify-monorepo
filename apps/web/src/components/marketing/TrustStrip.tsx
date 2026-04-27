import { ScrollReveal } from "@/components/marketing/ScrollReveal";

const LOGOS = [
  { src: "/logo/base.svg", label: "Base" },
  { src: "/logo/agentcard.svg", label: "AgentCard" },
  { src: "/logo/circle.svg", label: "Circle" },
  { src: "/logo/l402.svg", label: "L402" },
  { src: "/logo/mpp.svg", label: "MPP" },
  { src: "/logo/solana.svg", label: "Solana" },
  { src: "/logo/virtual.svg", label: "Virtuals" },
  { src: "/logo/x402.svg", label: "x402" },
  { src: "/logo/superteam.svg", label: "Superteam" },
] as const;

const LOGO_TINT = "#6F6C68";

function TrustLogo({ src, label }: { src: string; label: string }) {
  return (
    <div
      className="flex h-7 max-h-8 min-h-7 w-[min(160px,28vw)] min-w-[72px] max-w-[160px] shrink-0 items-center justify-center sm:h-8"
      role="img"
      aria-label={label}
    >
      <span
        className="block h-full w-full"
        style={{
          backgroundColor: LOGO_TINT,
          WebkitMaskImage: `url(${src})`,
          maskImage: `url(${src})`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    </div>
  );
}

function LogoRow() {
  return (
    <>
      {LOGOS.map(({ src, label }) => (
        <div key={src} className="flex shrink-0 items-center justify-center px-3 sm:px-10 md:px-8">
          <TrustLogo src={src} label={label} />
        </div>
      ))}
    </>
  );
}

type TrustStripProps = {
  /** `hero` = glass bar on top of video; default = full section between page blocks */
  variant?: "default" | "hero";
};

export function TrustStrip({ variant = "default" }: TrustStripProps) {
  const isHero = variant === "hero";
  const rootClass = isHero
    ? "w-full px-8 py-6 pb-10 md:px-10 lg:px-20"
    : "border-y border-border bg-bg-elevated/40 px-8 py-10 md:px-10 lg:px-20";
  const body = (
    <div className="mx-auto w-full max-w-full">
      <ScrollReveal
        fadeOnly
        durationMs={920}
        delayMs={0}
        className="flex justify-center text-center"
      >
        <p
          className={`w-full max-w-full text-sm leading-snug md:text-base ${isHero ? "text-zinc-400" : "text-muted"}`}
        >
          Integrated with
        </p>
      </ScrollReveal>

      <div
        className={`hidden flex-wrap items-center justify-center gap-x-4 gap-y-5 sm:gap-x-10 sm:gap-y-8 motion-reduce:flex ${isHero ? "mt-5" : "mt-8"}`}
        aria-label="Partner logos"
      >
        {LOGOS.map(({ src, label }) => (
          <div
            key={src}
            className="flex w-[min(160px,40vw)] min-w-[72px] max-w-[160px] justify-center sm:w-40"
          >
            <TrustLogo src={src} label={label} />
          </div>
        ))}
      </div>

      <div
        className={`relative overflow-hidden motion-reduce:hidden mask-[linear-gradient(90deg,transparent_0%,black_8%,black_92%,transparent_100%)] ${isHero ? "mt-5" : "mt-8"}`}
        aria-label="Partner logos, scrolling"
      >
        <div className="marquee-trust items-center">
          <LogoRow />
          <LogoRow />
        </div>
      </div>
    </div>
  );

  if (isHero) {
    return (
      <div role="region" aria-label="Partners" className={rootClass}>
        {body}
      </div>
    );
  }

  return <section className={rootClass}>{body}</section>;
}
