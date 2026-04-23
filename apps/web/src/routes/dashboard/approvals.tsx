import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/approvals")({
  component: ApprovalsPlaceholder,
});

function ApprovalsPlaceholder() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h2 className="text-lg font-semibold mb-2 text-foreground">Approvals queue</h2>
        <p className="text-muted-foreground text-[13px]">
          Coming soon — review and approve agent transactions here.
        </p>
      </div>
    </div>
  );
}
