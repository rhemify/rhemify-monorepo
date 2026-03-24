import { useEffect, useState } from 'react'

interface SpendBarProps {
  spent: number
  limit: number
}

function getFillColor(pct: number): string {
  if (pct >= 100) return 'var(--color-rhm-danger)'
  if (pct >= 80) return 'var(--color-rhm-warning)'
  return 'rgba(255, 255, 255, 0.25)'
}

export function SpendBar({ spent, limit }: SpendBarProps) {
  const [animated, setAnimated] = useState(false)
  const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="h-[3px] bg-border rounded-full overflow-hidden w-full">
      <div
        className="h-full rounded-full transition-[width] duration-[600ms] ease-out"
        style={{
          background: getFillColor(pct),
          width: animated ? `${pct}%` : '0%',
        }}
      />
    </div>
  )
}
