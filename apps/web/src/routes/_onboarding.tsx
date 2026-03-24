import { createFileRoute, Outlet, useMatches } from '@tanstack/react-router'
import { useTheme } from '@/lib/theme/theme-provider'
import { useEffect } from 'react'
import { ProgressBar } from '@/components/onboarding/progress-bar'

export const Route = createFileRoute('/_onboarding')({
  component: OnboardingLayout,
})

const STEP_MAP: Record<string, number> = {
  '/_onboarding/signup': 1,
  '/_onboarding/build': 2,
  '/_onboarding/fund': 3,
  '/_onboarding/deploy': 4,
}

function OnboardingLayout() {
  const { setTheme } = useTheme()
  const matches = useMatches()
  const lastMatch = matches[matches.length - 1]
  const step = STEP_MAP[lastMatch?.routeId ?? ''] ?? 1

  useEffect(() => { setTheme('light') }, [setTheme])

  return (
    <div className="theme-onboarding min-h-screen bg-background text-foreground">
      <header className="flex justify-between items-center px-8 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="bg-primary w-[26px] h-[26px] rounded-md flex items-center justify-center text-primary-foreground font-semibold text-xs">
            R
          </div>
          <span className="font-medium text-sm text-foreground">rhemify</span>
        </div>
        <ProgressBar currentStep={step} totalSteps={4} />
        <div className="w-[100px]" />
      </header>

      <main className="max-w-[520px] mx-auto px-6 py-12">
        <Outlet />
      </main>
    </div>
  )
}
