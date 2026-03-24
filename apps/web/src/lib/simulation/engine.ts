import type { QueryClient } from '@tanstack/react-query'
import type { Transaction, PaymentStandard } from '@/lib/types'
import { fleetService } from '@/lib/services'
import { queryKeys } from '@/lib/hooks/query-keys'
import { VENDOR_POOL, BLOCKED_DOMAINS } from './vendors'

export class SimulationEngine {
  private intervalId: ReturnType<typeof setTimeout> | null = null
  private queryClient: QueryClient
  private txCounter = 0

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient
  }

  start(): void {
    if (this.intervalId) return
    this.tick()
  }

  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId)
      this.intervalId = null
    }
  }

  private tick(): void {
    this.generateTransaction()
    const delay = 2000 + Math.random() * 6000
    this.intervalId = setTimeout(() => this.tick(), delay)
  }

  private generateTransaction(): void {
    const agents = fleetService.getAgents().filter((a) => a.status === 'running')
    if (agents.length === 0) return

    const agent = agents[Math.floor(Math.random() * agents.length)]
    const deptId = agent.department.id
    const vendors = VENDOR_POOL[deptId] ?? VENDOR_POOL.ceo

    const policy = fleetService.getPolicy(agent.id)
    const tryBlocked = Math.random() < 0.1

    let vendor: string
    let domain: string
    let amount: number
    let standard: PaymentStandard
    let blockedReason: string | undefined
    let isBlocked = false

    if (tryBlocked) {
      const blockedDomain = BLOCKED_DOMAINS[Math.floor(Math.random() * BLOCKED_DOMAINS.length)]
      vendor = blockedDomain
      domain = blockedDomain
      amount = 0
      standard = agent.primaryStandard
      blockedReason = 'domain not in allowlist'
      isBlocked = true
    } else {
      const entry = vendors[Math.floor(Math.random() * vendors.length)]
      vendor = entry.vendor
      domain = entry.domain
      amount = +(entry.minAmount + Math.random() * (entry.maxAmount - entry.minAmount)).toFixed(3)
      standard =
        agent.allowedStandards[Math.floor(Math.random() * agent.allowedStandards.length)]

      if (policy && policy.domainAllowlist.length > 0 && !policy.domainAllowlist.includes(domain)) {
        isBlocked = true
        blockedReason = 'domain not in allowlist'
        amount = 0
      }

      if (!isBlocked && policy && amount > policy.maxPerTransaction) {
        isBlocked = true
        blockedReason = 'exceeds max per transaction'
        amount = 0
      }

      if (!isBlocked && policy && agent.spentToday + amount > policy.dailyLimit) {
        isBlocked = true
        blockedReason = 'daily limit exceeded'
        amount = 0
      }
    }

    const tx: Transaction = {
      id: `tx-${++this.txCounter}`,
      agentId: agent.id,
      agentName: agent.name,
      vendor,
      domain,
      amount,
      standard,
      status: isBlocked ? 'blocked' : 'completed',
      blockedReason,
      timestamp: new Date(),
    }

    fleetService.addTransaction(tx)

    this.queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
    this.queryClient.invalidateQueries({ queryKey: queryKeys.transactions.byAgent(agent.id) })
    this.queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })
    this.queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) })
    this.queryClient.invalidateQueries({ queryKey: queryKeys.fleetStats })
  }
}
