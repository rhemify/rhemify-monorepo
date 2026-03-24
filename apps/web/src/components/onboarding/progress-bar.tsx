interface ProgressBarProps {
  currentStep: number
  totalSteps: number
}

export function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  return (
    <div className="flex gap-[3px] w-[200px]">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={`flex-1 h-[3px] rounded-full transition-colors duration-300 ${
            i < currentStep ? 'bg-primary' : 'bg-border'
          }`}
        />
      ))}
    </div>
  )
}
