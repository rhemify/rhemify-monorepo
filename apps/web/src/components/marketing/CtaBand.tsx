import { Button } from "@/components/marketing/Button";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

export function CtaBand() {
  return (
    <section className="bg-bg px-8 py-12 md:px-10 md:py-16 lg:px-20 lg:py-20">
      <div className="mx-auto w-full max-w-full">
        <ScrollReveal y={16} durationMs={1000} delayMs={0} className="block">
          <div className="relative flex min-h-[min(620px,100vh)] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-bg lg:min-h-[640px]">
            {/* Canvas under the art so corners / transparent pixels never flash a different black */}
            <div aria-hidden className="absolute inset-0 z-0 bg-bg" />

            {/* Full-card background image */}
            <img
              src="/payment-history1.png"
              alt="Illustration representing open, verifiable agent payments and treasury control."
              className="absolute inset-0 z-1 size-full object-cover object-center"
              loading="lazy"
              decoding="async"
            />

            {/* Mobile: scrim — same hue as `bg-bg` (#060607); avoid `black/*` which skews cooler vs the page */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-2 bg-linear-to-b from-transparent from-28% via-[#060607]/52 via-55% to-[#060607] lg:hidden"
            />
            {/* Desktop: scrim toward copy column */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-2 hidden bg-linear-to-tr from-[#060607]/90 from-26% via-[#060607]/38 via-46% to-transparent lg:block"
            />

            {/* Copy sits on the darkened side — flex-1 + min-h-0 so justify-end has real height (min-h alone does not satisfy h-full). */}
            <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-end p-8 lg:p-0 lg:pt-0 lg:pb-0">
              <div className="max-w-lg lg:col-start-2 lg:flex lg:min-h-0 lg:flex-1 lg:max-w-none lg:flex-col lg:justify-end lg:px-10 lg:py-12 lg:pl-6 lg:pr-12 xl:px-14">
                <p className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-[13px] font-medium text-accent backdrop-blur-[2px]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  Partner with us
                </p>

                <h2 className="mt-5 text-4xl font-bold tracking-tight text-text drop-shadow-[0_1px_24px_rgba(6,6,7,0.72)]">
                  <span className="text-accent">Deploy</span>{" "}
                  <span>agent companies at institutional scale. With full visibility.</span>
                </h2>

                {/* <p className="mt-4 text-[clamp(0.95rem,1.35vw,1.1rem)] leading-relaxed text-zinc-200/95 drop-shadow-[0_1px_16px_rgba(0,0,0,0.5)]">
                  Join teams using Rhemify to coordinate spend, enforce policies, and delegate work across
                  autonomous agents—with real-time logs and budgets you control.
                </p> */}

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <Button
                    href="#pricing"
                    className="h-auto min-h-[44px] cursor-pointer rounded-xl border border-transparent bg-accent px-8 py-3.5 text-[15px] font-semibold text-btn-primary-text shadow-none transition-colors hover:bg-accent-hover"
                  >
                    Start with Rhemify
                  </Button>
                  <Button
                    href="mailto:team@rhemify.com?subject=Rhemify%20%E2%80%94%20partnership%20inquiry"
                    className="h-auto min-h-[44px] cursor-pointer rounded-xl border border-white/20 bg-[#060607]/75 px-8 py-3.5 text-[15px] font-semibold text-text shadow-none transition-colors hover:border-white/35 hover:bg-[#060607]/90"
                  >
                    Talk to our team
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
