import { useState } from "react";

interface Department {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconBg: string;
  enabled: boolean;
  locked?: boolean;
}

const initialDepartments: Department[] = [
  {
    id: "ceo",
    name: "CEO Agent",
    description: "Always included",
    icon: "⬡",
    iconBg: "#F0FBD0",
    enabled: true,
    locked: true,
  },
  {
    id: "research",
    name: "Research",
    description: "perplexity.ai, tavily.com",
    icon: "◇",
    iconBg: "#E6F1FB",
    enabled: true,
  },
  {
    id: "marketing",
    name: "Marketing",
    description: "twitter.com, buffer.com",
    icon: "◫",
    iconBg: "#FFF0D4",
    enabled: true,
  },
  {
    id: "engineering",
    name: "Engineering",
    description: "github.com, vercel.com",
    icon: "◧",
    iconBg: "#FFE5E5",
    enabled: false,
  },
  {
    id: "finance",
    name: "Finance",
    description: "stripe.com, quickbooks.com",
    icon: "◩",
    iconBg: "#EDECEA",
    enabled: false,
  },
];

function Toggle({
  enabled,
  locked,
  onToggle,
}: {
  enabled: boolean;
  locked?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onToggle}
      className={`relative w-[36px] h-[20px] rounded-full transition-colors duration-150 ease-in-out ${
        enabled ? "bg-rhm-accent" : "bg-muted"
      } ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white transition-[left] duration-150 ease-in-out ${
          enabled ? "left-[18px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

export function CompanyBuilderWidget() {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);

  const enabledCount = departments.filter((d) => d.enabled && !d.locked).length;
  const price = (enabledCount * 9).toFixed(2);

  function toggleDepartment(id: string) {
    setDepartments((prev) =>
      prev.map((d) => (d.id === id && !d.locked ? { ...d, enabled: !d.enabled } : d)),
    );
  }

  return (
    <div className="bg-white rounded-[12px] border-[0.5px] border-border p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b-[0.5px] border-border">
        <span className="text-[14px] font-bold text-foreground">Build your company</span>
        <span className="font-mono text-[13px] text-rhm-accent-dark bg-rhm-accent-tint px-2 py-0.5 rounded-[4px]">
          ${price}/mo
        </span>
      </div>

      {/* Department rows */}
      <div>
        {departments.map((dept, i) => (
          <div
            key={dept.id}
            className={`flex items-center justify-between py-[10px] ${
              i < departments.length - 1 ? "border-b-[0.5px] border-border" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center text-sm"
                style={{ backgroundColor: dept.iconBg }}
              >
                {dept.icon}
              </div>
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-foreground">{dept.name}</span>
                <span className="text-[11px] text-muted-foreground">{dept.description}</span>
              </div>
            </div>
            <Toggle
              enabled={dept.enabled}
              locked={dept.locked}
              onToggle={() => toggleDepartment(dept.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
