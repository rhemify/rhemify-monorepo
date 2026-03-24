import type { Department } from '@/lib/types'
import { Toggle } from '@/components/onboarding/toggle'

interface DepartmentRowProps {
  department: Department
  active: boolean
  onToggle: () => void
}

export function DepartmentRow({ department, active, onToggle }: DepartmentRowProps) {
  return (
    <div
      className={`flex items-center gap-3 bg-card rounded-lg px-3.5 py-2.5 transition-all duration-200 ${
        active ? 'border border-foreground opacity-100' : 'border border-border opacity-45'
      }`}
    >
      <div className="w-6 h-6 rounded-[5px] bg-black/[0.04] flex items-center justify-center text-[13px] shrink-0">
        {department.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium">{department.name}</div>
        <span className="font-mono text-[9px] text-foreground/30">
          {department.defaultSkills.join(' · ')}
        </span>
      </div>

      <span className="font-mono text-[10px] text-foreground/30 shrink-0">
        ${department.pricePerMonth}/mo
      </span>

      <Toggle checked={active} onChange={onToggle} />
    </div>
  )
}
