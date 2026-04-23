import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_onboarding")({
  component: () => <Navigate to="/" />,
});
