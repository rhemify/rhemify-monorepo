type StepStatus = 'pending' | 'loading' | 'done'

interface DeployStepProps {
  status: StepStatus
  label: string
  stepNumber: number
}

export function DeployStep({ status, label, stepNumber }: DeployStepProps) {
  return (
    <>
      <style>{`
        @keyframes rhemify-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div className="flex items-center gap-3">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
            status === 'done'
              ? 'bg-rhm-success text-white'
              : status === 'pending'
                ? 'bg-border text-white'
                : ''
          }`}
          style={
            status === 'loading'
              ? {
                  background: 'transparent',
                  border: '2px solid var(--foreground)',
                  borderTopColor: 'transparent',
                  animation: 'rhemify-spin 0.8s linear infinite',
                }
              : undefined
          }
        >
          {status === 'done' ? '✓' : status === 'pending' ? stepNumber : ''}
        </div>
        <span
          className={`text-sm ${
            status === 'done'
              ? 'text-rhm-success'
              : status === 'loading'
                ? 'text-foreground'
                : 'text-foreground/30'
          }`}
        >
          {label}
        </span>
      </div>
    </>
  )
}
