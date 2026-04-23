import { useKillSwitch } from "@/lib/hooks";

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const killSwitch = useKillSwitch();

  return (
    <header className="h-14 min-h-14 border-b border-border flex items-center justify-between px-7">
      <span className="text-sm font-medium text-muted-foreground">{title}</span>
      <button
        onClick={() => killSwitch.mutate()}
        className="bg-[#dc2626] text-white text-xs font-medium px-[18px] py-[7px] rounded-md border-none cursor-pointer hover:opacity-[0.88] transition-opacity duration-150"
      >
        Kill switch
      </button>
    </header>
  );
}
