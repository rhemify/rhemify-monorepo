import type { Agent, Transaction, FleetStats, Policy, Session } from '@/lib/types'

export interface FleetService {
  getSession(): Session | null
  setSession(session: Session): void

  getAgents(): Agent[]
  getAgent(id: string): Agent | undefined
  updateAgentStatus(id: string, status: Agent['status']): void

  getTransactions(limit?: number): Transaction[]
  getAgentTransactions(agentId: string, limit?: number): Transaction[]
  addTransaction(tx: Transaction): void

  getFleetStats(): FleetStats

  getPolicy(agentId: string): Policy | undefined
  updatePolicy(agentId: string, updates: Partial<Policy>): void

  deployFleet(departmentIds: string[]): Agent[]
  killSwitch(): void

  subscribe(callback: () => void): () => void
}
