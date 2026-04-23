import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/wallets")({
  component: WalletsPlaceholder,
});

function WalletsPlaceholder() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h2 className="text-lg font-semibold mb-2 text-foreground">Wallet manifest</h2>
        <p className="text-muted-foreground text-[13px]">
          Coming soon — manage your payment wallets here.
        </p>
      </div>
    </div>
  );
}
