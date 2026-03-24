import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fleetService } from '@/lib/services'
import { queryKeys } from './query-keys'
import type { Session } from '@/lib/types'

export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => fleetService.getSession(),
  })
}

export function useSetSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (session: Session) => {
      fleetService.setSession(session)
      return Promise.resolve()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session })
    },
  })
}
