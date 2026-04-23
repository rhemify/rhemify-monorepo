export { DEPARTMENT_TEMPLATES } from "./departments";
import { DEPARTMENT_TEMPLATES } from "./departments";
import type { Department } from "@/lib/types";

export function getDepartment(id: string): Department | undefined {
  return DEPARTMENT_TEMPLATES.find((d) => d.id === id);
}

export function getAlwaysOnDepartments(): Department[] {
  return DEPARTMENT_TEMPLATES.filter((d) => d.alwaysOn);
}

export function getToggleableDepartments(): Department[] {
  return DEPARTMENT_TEMPLATES.filter((d) => !d.alwaysOn);
}

export function calculateMonthlyPrice(activeDeptIds: string[]): number {
  return DEPARTMENT_TEMPLATES.filter((d) => activeDeptIds.includes(d.id)).reduce(
    (sum, d) => sum + d.pricePerMonth,
    0,
  );
}

export function getFreeTierCount(): number {
  return 3;
}
