import { Slider } from "@/components/onboarding/slider";
import type { Policy } from "@/lib/types";

interface PolicySlidersProps {
  policy: Policy;
  onUpdate: (updates: Partial<Policy>) => void;
}

const fmt = (v: number) => `$${v.toFixed(2)}`;

export function PolicySliders({ policy, onUpdate }: PolicySlidersProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-foreground/20 mb-5">
        SPEND CONTROLS
      </div>
      <div className="flex flex-col gap-5">
        <Slider
          label="Daily spend limit"
          value={policy.dailyLimit}
          min={1}
          max={20}
          step={0.5}
          formatValue={fmt}
          onChange={(v) => onUpdate({ dailyLimit: v })}
        />
        <Slider
          label="Max per transaction"
          value={policy.maxPerTransaction}
          min={0.1}
          max={5}
          step={0.1}
          formatValue={fmt}
          onChange={(v) => onUpdate({ maxPerTransaction: v })}
        />
        <Slider
          label="Approval threshold"
          value={policy.approvalThreshold}
          min={1}
          max={50}
          step={1}
          formatValue={fmt}
          onChange={(v) => onUpdate({ approvalThreshold: v })}
        />
      </div>
    </div>
  );
}
