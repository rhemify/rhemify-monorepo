import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSession, useSetSession } from "@/lib/hooks";
import { Slider } from "@/components/onboarding/slider";

export const Route = createFileRoute("/_onboarding/fund")({
  component: FundScreen,
});

function FundScreen() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const setSession = useSetSession();

  const [spendCap, setSpendCap] = useState(100);

  const handleDeploy = () => {
    if (session) {
      setSession.mutate({ ...session, monthlySpendCap: spendCap });
    }
    navigate({ to: "/deploy" });
  };

  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-[-0.03em] mb-1.5">
        How should your agents pay?
      </h1>
      <p className="text-muted-foreground text-[13px] mb-8">
        No USDC. No wallets. No blockchain. Just your Visa.
      </p>

      {/* Tab toggle */}
      <div className="flex mb-5">
        <button className="flex-1 h-9 text-[13px] font-medium bg-primary text-primary-foreground rounded-l-lg cursor-pointer border-none">
          Pay with card
        </button>
        <button className="flex-1 h-9 text-[13px] font-medium bg-card text-muted-foreground border border-border rounded-r-lg cursor-default">
          Crypto wallet
        </button>
      </div>

      {/* MPP confirmation badge */}
      <div className="bg-rhm-success/[0.06] border border-rhm-success/15 rounded-lg px-3.5 py-2.5 mb-5">
        <span className="text-rhm-success text-[11px]">
          ✓ MPP Shared Payment Token — agents pay with this card
        </span>
      </div>

      {/* Card fields */}
      <div className="flex flex-col gap-2.5 mb-6">
        <div className="bg-card border border-border rounded-lg px-3.5 py-2.5">
          <span className="font-mono text-sm text-foreground">4242 4242 4242 4242</span>
        </div>
        <div className="flex gap-2.5">
          <div className="flex-1 bg-card border border-border rounded-lg px-3.5 py-2.5">
            <span className="font-mono text-sm text-foreground">09/27</span>
          </div>
          <div className="flex-1 bg-card border border-border rounded-lg px-3.5 py-2.5">
            <span className="font-mono text-sm text-foreground">•••</span>
          </div>
        </div>
      </div>

      {/* Spend cap slider */}
      <div className="mb-7">
        <Slider
          label="Monthly spend cap"
          value={spendCap}
          min={50}
          max={500}
          step={10}
          onChange={setSpendCap}
          formatValue={(v) => `$${v} / mo`}
        />
      </div>

      {/* CTA */}
      <button
        onClick={handleDeploy}
        className="w-full h-9 px-4 rounded-lg text-[13px] font-medium bg-primary text-primary-foreground hover:opacity-[0.88] transition-opacity duration-150 cursor-pointer"
      >
        Deploy agents →
      </button>
    </div>
  );
}
