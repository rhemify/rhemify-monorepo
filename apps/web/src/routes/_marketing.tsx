import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_marketing")({
  component: MarketingLayout,
});

function MarketingLayout() {
  return (
    <div className="bg-bg font-sans text-text antialiased">
      <Outlet />
    </div>
  );
}
