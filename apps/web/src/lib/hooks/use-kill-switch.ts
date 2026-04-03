import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useFleetId } from "@/lib/convex";

export function useKillSwitch() {
  const fleetId = useFleetId();
  const killSwitch = useMutation(api.agents.killSwitch);

  return {
    mutate: () => {
      if (fleetId) {
        killSwitch({ fleet_id: fleetId });
      }
    },
  };
}
