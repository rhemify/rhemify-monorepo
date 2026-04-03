import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { PaymentStandard } from "@/lib/types";
import { VENDOR_POOL, BLOCKED_DOMAINS } from "./vendors";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

type ConvexAgent = {
  _id: Id<"agents">;
  name: string;
  department_id: string;
  status: string;
  spent_today: number;
  daily_limit: number;
  primary_standard: string;
  allowed_domains: string[];
  allowed_standards: string[];
};

type ConvexPolicy = {
  daily_limit: number;
  max_per_transaction: number;
  domain_allowlist: string[];
} | null;

export class SimulationEngine {
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private client: ConvexHttpClient;
  private fleetId: Id<"fleets"> | null = null;

  constructor() {
    this.client = new ConvexHttpClient(CONVEX_URL);
  }

  start(fleetId: Id<"fleets">): void {
    if (this.intervalId) return;
    this.fleetId = fleetId;
    this.tick();
  }

  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    this.generateTransaction();
    const delay = 2000 + Math.random() * 6000;
    this.intervalId = setTimeout(() => this.tick(), delay);
  }

  private async generateTransaction(): Promise<void> {
    if (!this.fleetId) return;

    try {
      const agents: ConvexAgent[] = await this.client.query(
        api.agents.list,
        { fleet_id: this.fleetId },
      );
      const running = agents.filter((a) => a.status === "running");
      if (running.length === 0) return;

      const agent = running[Math.floor(Math.random() * running.length)];
      const deptId = agent.department_id;
      const vendors = VENDOR_POOL[deptId] ?? VENDOR_POOL.ceo;

      const policy: ConvexPolicy = await this.client.query(
        api.policies.getByAgent,
        { agent_id: agent._id },
      );
      const tryBlocked = Math.random() < 0.1;

      let vendor: string;
      let domain: string;
      let amount: number;
      let standard: PaymentStandard;
      let blockedReason: string | undefined;
      let isBlocked = false;

      if (tryBlocked) {
        const blockedDomain =
          BLOCKED_DOMAINS[Math.floor(Math.random() * BLOCKED_DOMAINS.length)];
        vendor = blockedDomain;
        domain = blockedDomain;
        amount = 0;
        standard = agent.primary_standard as PaymentStandard;
        blockedReason = "domain not in allowlist";
        isBlocked = true;
      } else {
        const entry = vendors[Math.floor(Math.random() * vendors.length)];
        vendor = entry.vendor;
        domain = entry.domain;
        amount = +(
          entry.minAmount +
          Math.random() * (entry.maxAmount - entry.minAmount)
        ).toFixed(3);
        standard = agent.allowed_standards[
          Math.floor(Math.random() * agent.allowed_standards.length)
        ] as PaymentStandard;

        if (
          policy &&
          policy.domain_allowlist.length > 0 &&
          !policy.domain_allowlist.includes(domain)
        ) {
          isBlocked = true;
          blockedReason = "domain not in allowlist";
          amount = 0;
        }

        if (!isBlocked && policy && amount > policy.max_per_transaction) {
          isBlocked = true;
          blockedReason = "exceeds max per transaction";
          amount = 0;
        }

        if (
          !isBlocked &&
          policy &&
          agent.spent_today + amount > policy.daily_limit
        ) {
          isBlocked = true;
          blockedReason = "daily limit exceeded";
          amount = 0;
        }
      }

      await this.client.mutation(api.transactions.add, {
        fleet_id: this.fleetId,
        agent_id: agent._id,
        agent_name: agent.name,
        vendor,
        domain,
        amount,
        standard,
        status: isBlocked ? "blocked" : "completed",
        blocked_reason: blockedReason,
      });
    } catch (err) {
      console.error("Simulation tick failed:", err);
    }
  }
}
