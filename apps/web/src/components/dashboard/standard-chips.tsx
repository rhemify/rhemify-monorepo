import type { PaymentStandard } from "@/lib/types";

interface StandardChipsProps {
  allowedStandards: PaymentStandard[];
  onToggle: (standard: PaymentStandard) => void;
}

const standards: { id: PaymentStandard; label: string }[] = [
  { id: "x402", label: "x402" },
  { id: "mpp", label: "MPP" },
  { id: "l402", label: "L402" },
  { id: "ap2", label: "AP2" },
];

const activeColors: Record<PaymentStandard, string> = {
  x402: "border-[#47c8ff] bg-[#47c8ff]/[0.08] text-[#47c8ff]",
  mpp: "border-rhm-accent bg-rhm-accent/[0.08] text-rhm-accent",
  l402: "border-rhm-warning bg-rhm-warning/[0.08] text-rhm-warning",
  ap2: "border-[#47c8ff] bg-[#47c8ff]/[0.08] text-[#47c8ff]",
};

export function StandardChips({ allowedStandards, onToggle }: StandardChipsProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-foreground/20 mb-5">
        PAYMENT STANDARDS
      </div>
      <div className="flex flex-wrap gap-2">
        {standards.map((s) => {
          const active = allowedStandards.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-medium cursor-pointer border transition-all duration-150 ${
                active ? activeColors[s.id] : "border-border text-foreground/20 bg-transparent"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
