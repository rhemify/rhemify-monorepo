type Status = 'running' | 'paused' | 'frozen'

interface StatusDotProps {
  status: Status
}

const colorMap: Record<Status, string> = {
  running: 'bg-rhm-success',
  paused: 'bg-rhm-warning',
  frozen: 'bg-rhm-danger',
}

export function StatusDot({ status }: StatusDotProps) {
  return (
    <>
      {status === 'running' && (
        <style>{`
          @keyframes rhemify-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      )}
      <span
        className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${colorMap[status]}`}
        style={status === 'running' ? { animation: 'rhemify-pulse 2s infinite ease-in-out' } : undefined}
      />
    </>
  )
}
