import type { Department } from "@/lib/types";

export const DEPARTMENT_TEMPLATES: Department[] = [
  {
    id: "ceo",
    name: "CEO",
    icon: "⬡",
    defaultSkills: ["orchestration", "delegation", "oversight"],
    alwaysOn: true,
    pricePerMonth: 0,
  },
  {
    id: "research",
    name: "Research",
    icon: "◈",
    defaultSkills: ["web_search", "pdf_extract", "data_feeds"],
    alwaysOn: false,
    pricePerMonth: 9,
  },
  {
    id: "marketing",
    name: "Marketing",
    icon: "◫",
    defaultSkills: ["copy_gen", "ad_creative", "social"],
    alwaysOn: false,
    pricePerMonth: 9,
  },
  {
    id: "sales",
    name: "Sales",
    icon: "◆",
    defaultSkills: ["lead_enrich", "crm_sync", "outreach"],
    alwaysOn: false,
    pricePerMonth: 9,
  },
  {
    id: "engineering",
    name: "Engineering",
    icon: "⬢",
    defaultSkills: ["github_alerts", "triage", "security"],
    alwaysOn: false,
    pricePerMonth: 9,
  },
  {
    id: "finance",
    name: "Finance",
    icon: "▣",
    defaultSkills: ["reconcile", "invoicing", "expense"],
    alwaysOn: false,
    pricePerMonth: 9,
  },
];
