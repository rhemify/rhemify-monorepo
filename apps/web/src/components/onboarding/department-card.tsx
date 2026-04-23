import type { Department } from "@/lib/types";

interface DepartmentCardProps {
  department: Department;
}

export function DepartmentCard({ department }: DepartmentCardProps) {
  return (
    <div className="border border-foreground bg-card rounded-[10px] px-5 py-4 text-center">
      <div className="w-9 h-9 rounded-lg bg-black/[0.04] flex items-center justify-center text-lg mx-auto mb-2">
        {department.icon}
      </div>
      <div className="text-sm font-semibold mb-1">{department.name}</div>
      <span className="font-mono text-[10px] text-foreground/30 block mb-1">
        {department.defaultSkills.join(" · ")}
      </span>
      <span className="font-mono text-[10px] text-foreground/30">always on · free</span>
    </div>
  );
}
