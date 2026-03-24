import { useNavigate } from '@tanstack/react-router'
import type { Agent } from '@/lib/types'
import { StatusDot } from '@/components/dashboard/status-dot'
import { SpendBar } from '@/components/dashboard/spend-bar'

interface FleetRowProps {
  agent: Agent
}

export function FleetRow({ agent }: FleetRowProps) {
  const navigate = useNavigate()

  return (
    <div
      role="link"
      tabIndex={0}
      className="grid grid-cols-[1.4fr_0.6fr_2fr_0.7fr] items-center h-12 px-5 border-b border-white/[0.03] cursor-pointer hover:bg-white/[0.04] transition-colors duration-150"
      onClick={() => navigate({ to: `/dashboard/agent/${agent.id}` as string })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate({ to: `/dashboard/agent/${agent.id}` as string })
      }}
    >
      <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <StatusDot status={agent.status} />
        {agent.name}
      </span>
      <span>
        <span className="font-mono text-[10px] bg-white/5 text-white/40 px-2 py-0.5 rounded inline-flex items-center">
          {agent.primaryStandard}
        </span>
      </span>
      <span className="flex items-center gap-2.5">
        <span className="flex-1">
          <SpendBar spent={agent.spentToday} limit={agent.dailyLimit} />
        </span>
        <span className="font-mono text-[11px] text-white/40 shrink-0">
          ${agent.spentToday.toFixed(2)} / ${agent.dailyLimit}
        </span>
      </span>
      <span className={`text-[11px] ${agent.status === 'running' ? 'text-rhm-success' : 'text-foreground/20'}`}>
        {agent.status}
      </span>
    </div>
  )
}
