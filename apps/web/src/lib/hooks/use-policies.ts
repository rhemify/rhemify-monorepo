import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fleetService } from '@/lib/services'
import { queryKeys } from './query-keys'
import type { Policy } from '@/lib/types'

export function usePolicies(agentId: string) {
  return useQuery({
    queryKey: queryKeys.policies.byAgent(agentId),
    queryFn: () => fleetService.getPolicy(agentId),
  })
}

export function useUpdatePolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ agentId, updates }: { agentId: string; updates: Partial<Policy> }) => {
      fleetService.updatePolicy(agentId, updates)
      return Promise.resolve()
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.policies.byAgent(agentId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) })
    },
  })
}
