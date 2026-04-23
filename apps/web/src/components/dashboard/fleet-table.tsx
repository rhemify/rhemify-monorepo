import { useAgents } from "@/lib/hooks";
import { FleetRow } from "@/components/dashboard/fleet-row";

export function FleetTable() {
  const { data: agents } = useAgents();

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border text-[13px] font-medium text-muted-foreground">
        Fleet registry
      </div>
      <div className="grid grid-cols-[1.4fr_0.6fr_2fr_0.7fr] h-9 items-center px-5 text-[11px] font-mono uppercase tracking-[0.05em] text-white/25 bg-white/[0.02]">
        <span>Agent</span>
        <span>Standard</span>
        <span>Spend</span>
        <span>Status</span>
      </div>
      {agents?.map((agent) => (
        <FleetRow key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
