import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useFleetId, useSetFleetId } from "@/lib/convex";

export function useDeployFleet() {
  const fleetId = useFleetId();
  const setFleetId = useSetFleetId();
  const createFleet = useMutation(api.fleets.create);
  const deployAgents = useMutation(api.agents.deploy);

  return {
    mutateAsync: async (departmentIds: string[]) => {
      let currentFleetId = fleetId;

      // Create fleet if not exists
      if (!currentFleetId) {
        currentFleetId = await createFleet({
          email: "demo@rhemify.com",
          company_name: "Demo Co",
          role: "solo-founder",
          active_departments: departmentIds,
          monthly_spend_cap: 100,
        });
        setFleetId(currentFleetId);
      }

      await deployAgents({
        fleet_id: currentFleetId,
        department_ids: departmentIds,
      });
    },
  };
}
