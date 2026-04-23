import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useTheme } from "@/lib/theme/theme-provider";
import { useEffect } from "react";
import { ProgressBar } from "@/components/onboarding/progress-bar";

export const Route = createFileRoute("/_onboarding")({
  component: OnboardingLayout,
});

const STEP_MAP: Record<string, number> = {
  "/_onboarding/signup": 1,
  "/_onboarding/build": 2,
  "/_onboarding/fund": 3,
  "/_onboarding/deploy": 4,
};

function OnboardingLayout() {
  const { setTheme } = useTheme();
  const matches = useMatches();
  const lastMatch = matches[matches.length - 1];
  const step = STEP_MAP[lastMatch?.routeId ?? ""] ?? 1;

  useEffect(() => {
    setTheme("light");
  }, [setTheme]);

  return (
    <div className="theme-onboarding min-h-screen bg-background text-foreground">
      <header className="flex justify-between items-center px-8 py-3.5 border-b border-border">
        <Link
          to="/"
          aria-label="Rhemify home"
          className="flex shrink-0 items-center py-1"
        >
          <span className="inline-flex items-center justify-center rounded-lg px-3 py-2">
            <img
              src="/rhemify-logo.svg"
              alt="Rhemify"
              className="h-[24px] w-auto"
              loading="eager"
              decoding="async"
            />
          </span>
        </Link>
        <ProgressBar currentStep={step} totalSteps={4} />
        <div className="w-[100px]" />
      </header>

      <main className="max-w-[520px] mx-auto px-6 py-12">
        <Outlet />
      </main>
    </div>
  );
}
