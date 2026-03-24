import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fleetService } from '@/lib/services'
import { queryKeys } from './query-keys'

export function useKillSwitch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => {
      fleetService.killSwitch()
      return Promise.resolve()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.fleetStats })
    },
  })
}
