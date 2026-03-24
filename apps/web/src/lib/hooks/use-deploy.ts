import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fleetService } from '@/lib/services'
import { queryKeys } from './query-keys'

export function useDeployFleet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (departmentIds: string[]) => {
      fleetService.deployFleet(departmentIds)
      return Promise.resolve()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.fleetStats })
      queryClient.invalidateQueries({ queryKey: queryKeys.session })
    },
  })
}
