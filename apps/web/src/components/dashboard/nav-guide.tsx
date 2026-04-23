import { StatusDot } from "@/components/dashboard/status-dot";

const completedSteps = ["Sign up", "Build", "Fund", "Deploy"];

export function NavGuide() {
  return (
    <div className="flex items-center gap-2 mb-6">
      {completedSteps.map((step) => (
        <span key={step} className="contents">
          <span className="text-[11px] text-foreground/20">{step} ✓</span>
          <span className="text-[11px] text-foreground/20">→</span>
        </span>
      ))}
      <span className="flex items-center gap-1.5 text-[11px] text-foreground">
        <StatusDot status="running" />
        Fleet live
      </span>
    </div>
  );
}
