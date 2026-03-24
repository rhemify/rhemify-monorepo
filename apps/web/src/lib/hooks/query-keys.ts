export const queryKeys = {
  agents: {
    all: ['agents'] as const,
    detail: (id: string) => ['agents', id] as const,
  },
  transactions: {
    all: ['transactions'] as const,
    byAgent: (agentId: string) => ['transactions', agentId] as const,
  },
  fleetStats: ['fleet-stats'] as const,
  policies: {
    byAgent: (agentId: string) => ['policies', agentId] as const,
  },
  session: ['session'] as const,
}
