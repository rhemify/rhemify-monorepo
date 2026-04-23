import { ConvexProvider, ConvexReactClient } from "convex/react";
import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { Id } from "@convex/_generated/dataModel";

let _convexClient: ConvexReactClient | null = null;

export function getConvexClient() {
  if (!_convexClient) {
    const url = import.meta.env.VITE_CONVEX_URL as string;
    _convexClient = new ConvexReactClient(url);
  }
  return _convexClient;
}

// Fleet context — holds the current fleet ID after onboarding
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

export function ConvexClientProvider({ children }: { children: ReactNode }) {
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
    <ConvexProvider client={getConvexClient()}>
      <FleetContext value={{ fleetId, setFleetId }}>
        {children}
      </FleetContext>
    </ConvexProvider>
  );
}
