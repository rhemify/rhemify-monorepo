import { createFileRoute } from '@tanstack/react-router'
import { useFleetStats } from '@/lib/hooks'
import { NavGuide } from '@/components/dashboard/nav-guide'
import { StatValue } from '@/components/dashboard/stat-value'
import { FleetTable } from '@/components/dashboard/fleet-table'
import { LiveFeed } from '@/components/dashboard/live-feed'

export const Route = createFileRoute('/dashboard/')({
  component: FleetOverview,
})

function FleetOverview() {
  const { data: stats } = useFleetStats()

  const spentDelta =
    stats && stats.spentYesterday > 0
      ? Math.round(((stats.spentToday - stats.spentYesterday) / stats.spentYesterday) * 100)
      : 0

  return (
    <div>
      <NavGuide />

      {/* Stats row */}
      <div className="flex gap-14 mb-8">
        <StatValue
          label="Active agents"
          value={stats?.activeAgents ?? 0}
          sub="all running"
          subColor="var(--color-rhm-success)"
        />
        <StatValue
          label="Spent today"
          value={`$${(stats?.spentToday ?? 0).toFixed(2)}`}
          mono
          sub={`${spentDelta >= 0 ? '+' : ''}${spentDelta}% vs yesterday`}
          subColor="var(--color-rhm-success)"
        />
        <StatValue
          label="Tasks completed"
          value={stats?.tasksCompleted ?? 0}
          sub="this session"
        />
        <StatValue
          label="Blocked"
          value={stats?.blockedAgents ?? 0}
          sub={stats && stats.blockedAgents > 0 ? 'support agent' : undefined}
          subColor={stats && stats.blockedAgents > 0 ? 'var(--color-rhm-danger)' : undefined}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-[1.3fr_1fr] gap-4 items-start">
        <FleetTable />
        <LiveFeed />
      </div>
    </div>
  )
}
