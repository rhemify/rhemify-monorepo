import { createFileRoute, Link } from '@tanstack/react-router'
import { useAgent, useAgentTransactions } from '@/lib/hooks'
import type { AgentStatus, Transaction } from '@/lib/types'
import { StatusDot } from '@/components/dashboard/status-dot'
import { Badge } from '@/components/dashboard/badge'
import { StatValue } from '@/components/dashboard/stat-value'
import { CapabilityManifest } from '@/components/dashboard/capability-manifest'

export const Route = createFileRoute('/dashboard/agent/$agentId')({
  component: AgentDetail,
})

const statusVariant: Record<AgentStatus, 'success' | 'warning' | 'danger'> = {
  running: 'success',
  paused: 'warning',
  frozen: 'danger',
}

function relativeTime(ts: Date): string {
  const diffMs = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const isBlocked = tx.status === 'blocked'

  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 border-b border-white/[0.03] ${
        isBlocked ? 'bg-red-500/[0.04]' : ''
      }`}
    >
      <span className="text-xs text-foreground">{tx.vendor}</span>
      <div className="flex items-center gap-3">
        {isBlocked ? (
          <span className="font-mono text-xs text-rhm-danger">blocked</span>
        ) : (
          <span className="font-mono text-xs text-foreground">${tx.amount.toFixed(2)}</span>
        )}
        <span className="text-[10px] text-foreground/20">{relativeTime(tx.timestamp)}</span>
      </div>
    </div>
  )
}

function AgentDetail() {
  const { agentId } = Route.useParams()
  const { data: agent } = useAgent(agentId)
  const { data: transactions } = useAgentTransactions(agentId)

  if (!agent) {
    return <div className="p-8 text-muted-foreground text-[13px]">Loading agent...</div>
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-5">
        <Link to="/dashboard" className="text-xs text-muted-foreground no-underline cursor-pointer">
          &larr; Dashboard
        </Link>
      </div>

      {/* Agent name + status */}
      <div className="flex items-center gap-2.5 mb-6">
        <span className="text-lg font-semibold text-foreground">{agent.name}</span>
        <StatusDot status={agent.status} />
        <Badge variant={statusVariant[agent.status]}>{agent.status}</Badge>
      </div>

      {/* Stats row */}
      <div className="flex gap-12 mb-6">
        <StatValue label="Spent today" value={`$${agent.spentToday.toFixed(2)}`} mono />
        <StatValue label="Daily limit" value={`$${agent.dailyLimit.toFixed(2)}`} mono />
        <StatValue label="Tasks" value={agent.tasksCompleted} />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-2 gap-4 items-start">
        <CapabilityManifest agent={agent} />

        {/* Recent transactions panel */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-foreground/20 px-4 py-2.5 border-b border-border">
            Recent transactions
          </div>
          <div>
            {transactions && transactions.length > 0 ? (
              transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
            ) : (
              <div className="p-4 text-xs text-muted-foreground">No transactions yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
