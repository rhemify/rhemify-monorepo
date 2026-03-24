import { useQuery } from '@tanstack/react-query'
import { fleetService } from '@/lib/services'
import { queryKeys } from './query-keys'

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents.all,
    queryFn: () => fleetService.getAgents(),
  })
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: queryKeys.agents.detail(id),
    queryFn: () => fleetService.getAgent(id),
  })
}
