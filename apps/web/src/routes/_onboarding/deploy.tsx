import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useSession, useDeployFleet } from '@/lib/hooks'
import { useTheme } from '@/lib/theme/theme-provider'
import { DeployStep } from '@/components/onboarding/deploy-step'
import { simulationEngine } from '@/router'
import { useFleetId } from '@/lib/convex'

export const Route = createFileRoute('/_onboarding/deploy')({
  component: DeployScreen,
})

const STEPS = [
  'Creating signing delegates',
  'Generating capability manifests',
  'Connecting payment standards',
  'Provisioning wallet manifest',
  'Applying fleet policies',
  'Starting agents',
]

function DeployScreen() {
  const navigate = useNavigate()
  const { data: session } = useSession()
  const deployFleet = useDeployFleet()
  const { setTheme } = useTheme()
  const fleetId = useFleetId()

  const [currentStep, setCurrentStep] = useState(0)
  const [complete, setComplete] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const hasFinished = useRef(false)

  // Step advancement timer
  useEffect(() => {
    if (currentStep >= STEPS.length) return

    const delay = 600 + Math.random() * 200
    const timer = setTimeout(() => {
      const nextStep = currentStep + 1

      // Theme transition at step 4 completion
      if (nextStep === 5) {
        setTheme('dark')
      }

      if (nextStep >= STEPS.length) {
        setCurrentStep(nextStep)
        setComplete(true)
      } else {
        setCurrentStep(nextStep)
      }
    }, delay)

    return () => clearTimeout(timer)
  }, [currentStep, setTheme])

  // Completion handler
  useEffect(() => {
    if (!complete || hasFinished.current) return
    hasFinished.current = true

    const departments = session?.activeDepartments ?? []
    deployFleet.mutateAsync(departments).then(() => {
      // fleetId is set by the deploy hook via context
      const id = localStorage.getItem('rhemify_fleet_id')
      if (id) {
        simulationEngine.start(id as typeof fleetId & string)
      }
    })

    setShowSuccess(true)
    const timer = setTimeout(() => {
      navigate({ to: '/dashboard' })
    }, 1500)

    return () => clearTimeout(timer)
  }, [complete, session, deployFleet, navigate])

  const progress = Math.min(currentStep / STEPS.length, 1) * 100

  const getStatus = (index: number) => {
    if (index < currentStep) return 'done' as const
    if (index === currentStep) return 'loading' as const
    return 'pending' as const
  }

  return (
    <div className="min-h-screen transition-colors duration-[800ms]">
      {!showSuccess ? (
        <>
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] mb-1.5">
            Spinning up your company...
          </h1>
          <p className="text-muted-foreground text-[13px] mb-8">
            This takes about 30 seconds.
          </p>

          {/* Deploy steps */}
          <div className="flex flex-col gap-4 mb-10">
            {STEPS.map((label, i) => (
              <DeployStep key={label} status={getStatus(i)} label={label} stepNumber={i + 1} />
            ))}
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-[400ms]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center min-h-[60vh] animate-[rhemify-fade-in_600ms_ease]">
          <style>{`
            @keyframes rhemify-fade-in {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <h1 className="text-[26px] font-semibold tracking-[-0.03em]">
            Your agent company is live.
          </h1>
        </div>
      )}
    </div>
  )
}
