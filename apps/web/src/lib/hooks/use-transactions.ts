import { useQuery } from '@tanstack/react-query'
import { fleetService } from '@/lib/services'
import { queryKeys } from './query-keys'

export function useTransactions(limit = 50) {
  return useQuery({
    queryKey: queryKeys.transactions.all,
    queryFn: () => fleetService.getTransactions(limit),
  })
}

export function useAgentTransactions(agentId: string, limit = 20) {
  return useQuery({
    queryKey: queryKeys.transactions.byAgent(agentId),
    queryFn: () => fleetService.getAgentTransactions(agentId, limit),
  })
}
