import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSession, useSetSession } from "@/lib/hooks";
import { getAlwaysOnDepartments, getToggleableDepartments } from "@/lib/templates";
import { DepartmentCard } from "@/components/onboarding/department-card";
import { DepartmentRow } from "@/components/onboarding/department-row";
import { PricingBar } from "@/components/onboarding/pricing-bar";

export const Route = createFileRoute("/_onboarding/build")({
  component: BuildScreen,
});

function BuildScreen() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const setSession = useSetSession();

  const alwaysOn = getAlwaysOnDepartments();
  const toggleable = getToggleableDepartments();
  const alwaysOnIds = alwaysOn.map((d) => d.id);

  const [activeDepts, setActiveDepts] = useState<string[]>([...alwaysOnIds]);

  const handleToggle = (id: string) => {
    setActiveDepts((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  };

  const handleContinue = () => {
    if (session) {
      setSession.mutate({ ...session, activeDepartments: activeDepts });
    }
    navigate({ to: "/fund" });
  };

  const ceoDept = alwaysOn[0];

  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-[-0.03em] mb-1.5">
        Toggle your departments
      </h1>
      <p className="text-muted-foreground text-[13px] mb-8">
        Your CEO agent is always on. First 3 agents free forever.
      </p>

      {ceoDept && <DepartmentCard department={ceoDept} />}

      {/* Connector line */}
      <div className="w-px h-3 bg-border mx-auto" />

      {/* Section label */}
      <div className="text-center mb-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-foreground/30">
          DEPARTMENTS
        </span>
      </div>

      {/* Toggleable department rows */}
      <div className="flex flex-col gap-2 mb-5">
        {toggleable.map((dept) => (
          <DepartmentRow
            key={dept.id}
            department={dept}
            active={activeDepts.includes(dept.id)}
            onToggle={() => handleToggle(dept.id)}
          />
        ))}
      </div>

      <PricingBar activeDepartmentIds={activeDepts} />

      <div className="mt-5">
        <button
          onClick={handleContinue}
          className="w-full h-9 cursor-pointer rounded-lg border border-(--onboarding-accent) bg-(--onboarding-accent) px-4 text-[13px] font-medium text-(--onboarding-accent-foreground) transition-opacity duration-150 hover:opacity-[0.88]"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
