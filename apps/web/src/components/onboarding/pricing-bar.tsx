import { calculateMonthlyPrice, getAlwaysOnDepartments } from "@/lib/templates";

interface PricingBarProps {
  activeDepartmentIds: string[];
}

export function PricingBar({ activeDepartmentIds }: PricingBarProps) {
  const price = calculateMonthlyPrice(activeDepartmentIds);
  const totalAgents = activeDepartmentIds.length;
  const freeIds = getAlwaysOnDepartments().map((d) => d.id);
  const freeCount = activeDepartmentIds.filter((id) => freeIds.includes(id)).length;
  const paidCount = totalAgents - freeCount;

  const summary =
    paidCount > 0
      ? `${totalAgents} agent${totalAgents !== 1 ? "s" : ""} · CEO free + ${paidCount} paid`
      : `${totalAgents} agent${totalAgents !== 1 ? "s" : ""} · CEO free`;

  return (
    <div className="border-t border-border px-3.5 py-3 flex justify-between items-center">
      <span className="font-mono text-base font-semibold">${price} / month</span>
      <span className="text-[11px] text-foreground/30">{summary}</span>
    </div>
  );
}
