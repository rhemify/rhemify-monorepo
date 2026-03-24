import { useQuery } from '@tanstack/react-query'
import { fleetService } from '@/lib/services'
import { queryKeys } from './query-keys'

export function useFleetStats() {
  return useQuery({
    queryKey: queryKeys.fleetStats,
    queryFn: () => fleetService.getFleetStats(),
  })
}
