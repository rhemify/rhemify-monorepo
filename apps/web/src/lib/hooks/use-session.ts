import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useFleetId, useSetFleetId } from "@/lib/convex";
import type { Session } from "@/lib/types";

export function useSession() {
  const fleetId = useFleetId();
  const data = useQuery(api.fleets.get, fleetId ? { id: fleetId } : "skip");

  const mapped: Session | undefined = data
    ? {
        email: data.email,
        companyName: data.company_name,
        role: data.role as Session["role"],
        activeDepartments: data.active_departments,
        monthlySpendCap: data.monthly_spend_cap,
        isDeployed: data.is_deployed,
      }
    : undefined;

  return { data: mapped, isLoading: data === undefined };
}

export function useSetSession() {
  const fleetId = useFleetId();
  const setFleetId = useSetFleetId();
  const createFleet = useMutation(api.fleets.create);
  const updateFleet = useMutation(api.fleets.update);

  return {
    mutate: async (session: Session) => {
      if (fleetId) {
        await updateFleet({
          id: fleetId,
          email: session.email,
          company_name: session.companyName,
          role: session.role,
          active_departments: session.activeDepartments,
          monthly_spend_cap: session.monthlySpendCap,
          is_deployed: session.isDeployed,
        });
      } else {
        const id = await createFleet({
          email: session.email,
          company_name: session.companyName,
          role: session.role,
          active_departments: session.activeDepartments,
          monthly_spend_cap: session.monthlySpendCap,
        });
        setFleetId(id);
      }
    },
  };
}
