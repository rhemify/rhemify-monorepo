import { Link, useLocation } from "@tanstack/react-router";
import { useAgents } from "@/lib/hooks";
import { StatusDot } from "@/components/dashboard/status-dot";

const navItems = [
  { label: "Overview", path: "/dashboard", icon: "◫" },
  { label: "Policies", path: "/dashboard/policies", icon: "◈" },
  { label: "Wallets", path: "/dashboard/wallets", icon: "▤" },
  { label: "Approvals", path: "/dashboard/approvals", icon: "✓" },
  { label: "Traces", path: "/dashboard/traces", icon: "≡" },
];

export function Sidebar() {
  const location = useLocation();
  const { data: agents } = useAgents();

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-[220px] min-w-[220px] h-screen bg-background border-r border-border flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-7">
        <div className="w-7 h-7 bg-[#fafafa] rounded-[7px] text-[#09090b] font-semibold text-[13px] flex items-center justify-center shrink-0">
          R
        </div>
        <span className="font-medium text-sm text-foreground">rhemify</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-1.5">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] no-underline transition-colors duration-150 ${
                active ? "text-[#fafafa] bg-white/[0.06]" : "text-white/50 hover:bg-white/[0.04]"
              }`}
            >
              <span className="text-sm w-[18px] text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Agents section */}
      <div className="mt-6 px-1.5">
        <div className="text-[11px] font-medium text-white/30 uppercase tracking-[0.06em] px-2.5 pb-2">
          Agents
        </div>
        <div className="flex flex-col gap-px">
          {agents?.map((agent) => (
            <Link
              key={agent.id}
              to={`/dashboard/agent/${agent.id}`}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-foreground no-underline rounded-md hover:bg-white/[0.04] transition-colors duration-150"
            >
              <StatusDot status={agent.status} />
              {agent.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Fleet info */}
      <div className="px-4 py-4 text-[11px] font-mono text-white/15 leading-[1.7]">
        <div>fleet: {agents?.length ?? 0} agents</div>
        <div>uptime: --</div>
      </div>
    </aside>
  );
}
