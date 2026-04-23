/**
 * Convex utilities for the frontend.
 * Auth provider is now in __root.tsx via ConvexBetterAuthProvider.
 * This file provides fleet context for the app.
 */

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { Id } from "@convex/_generated/dataModel";

type FleetContextValue = {
  fleetId: Id<"fleets"> | null;
  setFleetId: (id: Id<"fleets">) => void;
};

const FleetContext = createContext<FleetContextValue>({
  fleetId: null,
  setFleetId: () => {},
});

export function useFleetId() {
  return useContext(FleetContext).fleetId;
}

export function useSetFleetId() {
  return useContext(FleetContext).setFleetId;
}

export function FleetProvider({ children }: { children: ReactNode }) {
  const [fleetId, setFleetIdState] = useState<Id<"fleets"> | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("rhemify_fleet_id");
      return stored as Id<"fleets"> | null;
    }
    return null;
  });

  const setFleetId = (id: Id<"fleets">) => {
    setFleetIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("rhemify_fleet_id", id);
    }
  };

  return (
    <FleetContext value={{ fleetId, setFleetId }}>
      {children}
    </FleetContext>
  );
}
