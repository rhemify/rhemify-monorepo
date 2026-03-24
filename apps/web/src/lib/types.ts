export type PaymentStandard = 'mpp' | 'x402' | 'l402' | 'ap2'
export type AgentStatus = 'running' | 'paused' | 'frozen'
export type UserRole = 'solo-founder' | 'small-team' | 'enterprise'

export type Department = {
  id: string
  name: string
  icon: string
  defaultSkills: string[]
  alwaysOn: boolean
  pricePerMonth: number
}

export type Agent = {
  id: string
  name: string
  department: Department
  status: AgentStatus
  spentToday: number
  dailyLimit: number
  tasksCompleted: number
  primaryStandard: PaymentStandard
  skills: string[]
  allowedDomains: string[]
  allowedStandards: PaymentStandard[]
}

export type Transaction = {
  id: string
  agentId: string
  agentName: string
  vendor: string
  domain: string
  amount: number
  standard: PaymentStandard
  status: 'completed' | 'blocked' | 'pending'
  blockedReason?: string
  timestamp: Date
}

export type FleetStats = {
  activeAgents: number
  totalAgents: number
  spentToday: number
  spentYesterday: number
  tasksCompleted: number
  blockedAgents: number
}

export type Policy = {
  agentId: string
  dailyLimit: number
  maxPerTransaction: number
  approvalThreshold: number
  allowedStandards: PaymentStandard[]
  domainAllowlist: string[]
}

export type Session = {
  email: string
  companyName: string
  role: UserRole
  activeDepartments: string[]
  monthlySpendCap: number
  isDeployed: boolean
}
