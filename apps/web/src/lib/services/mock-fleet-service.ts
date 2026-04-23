import type { Agent, Transaction, FleetStats, Policy, Session, PaymentStandard } from "@/lib/types";
import type { FleetService } from "./fleet-service";
import { getDepartment } from "@/lib/templates";

const DEFAULT_DOMAINS: Record<string, string[]> = {
  ceo: ["notion.so", "slack.com"],
  research: ["perplexity.ai", "statista.com", "bloomberg.com"],
  marketing: ["canva.com", "figma.com", "unsplash.com"],
  sales: ["apollo.io", "linkedin.com", "clearbit.com"],
  engineering: ["github.com", "sentry.io", "datadog.com"],
  finance: ["stripe.com", "quickbooks.com", "plaid.com"],
};

const DEFAULT_STANDARDS: Record<string, PaymentStandard> = {
  ceo: "mpp",
  research: "x402",
  marketing: "mpp",
  sales: "x402",
  engineering: "x402",
  finance: "mpp",
};

export class MockFleetService implements FleetService {
  private session: Session | null = null;
  private agents: Agent[] = [];
  private transactions: Transaction[] = [];
  private policies = new Map<string, Policy>();
  private listeners = new Set<() => void>();

  getSession(): Session | null {
    return this.session;
  }

  setSession(session: Session): void {
    this.session = session;
    this.notify();
  }

  getAgents(): Agent[] {
    return [...this.agents];
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.find((a) => a.id === id);
  }

  updateAgentStatus(id: string, status: Agent["status"]): void {
    const agent = this.agents.find((a) => a.id === id);
    if (agent) {
      agent.status = status;
      this.notify();
    }
  }

  getTransactions(limit = 50): Transaction[] {
    return this.transactions.slice(-limit).reverse();
  }

  getAgentTransactions(agentId: string, limit = 20): Transaction[] {
    return this.transactions
      .filter((t) => t.agentId === agentId)
      .slice(-limit)
      .reverse();
  }

  addTransaction(tx: Transaction): void {
    this.transactions.push(tx);
    const agent = this.agents.find((a) => a.id === tx.agentId);
    if (agent && tx.status === "completed") {
      agent.spentToday += tx.amount;
      agent.tasksCompleted += 1;
    }
    this.notify();
  }

  getFleetStats(): FleetStats {
    const running = this.agents.filter((a) => a.status === "running");
    const frozen = this.agents.filter((a) => a.status === "frozen");
    const totalSpent = this.agents.reduce((s, a) => s + a.spentToday, 0);
    const totalTasks = this.agents.reduce((s, a) => s + a.tasksCompleted, 0);

    return {
      activeAgents: running.length,
      totalAgents: this.agents.length,
      spentToday: totalSpent,
      spentYesterday: totalSpent * 0.85,
      tasksCompleted: totalTasks,
      blockedAgents: frozen.length,
    };
  }

  getPolicy(agentId: string): Policy | undefined {
    return this.policies.get(agentId);
  }

  updatePolicy(agentId: string, updates: Partial<Policy>): void {
    const existing = this.policies.get(agentId);
    if (existing) {
      this.policies.set(agentId, { ...existing, ...updates });
      this.notify();
    }
  }

  deployFleet(departmentIds: string[]): Agent[] {
    this.agents = departmentIds.map((deptId) => {
      const dept = getDepartment(deptId);
      if (!dept) throw new Error(`Unknown department: ${deptId}`);

      const agentId = `${deptId}-001`;
      const primary = DEFAULT_STANDARDS[deptId] ?? "mpp";
      const domains = DEFAULT_DOMAINS[deptId] ?? [];

      this.policies.set(agentId, {
        agentId,
        dailyLimit: dept.alwaysOn ? 1 : 5,
        maxPerTransaction: 1,
        approvalThreshold: 5,
        allowedStandards: ["mpp", "x402", "l402"],
        domainAllowlist: domains,
      });

      return {
        id: agentId,
        name: dept.name,
        department: dept,
        status: "running" as const,
        spentToday: 0,
        dailyLimit: dept.alwaysOn ? 1 : 5,
        tasksCompleted: 0,
        primaryStandard: primary,
        skills: [...dept.defaultSkills],
        allowedDomains: domains,
        allowedStandards: ["mpp", "x402", "l402"],
      };
    });

    if (this.session) {
      this.session.isDeployed = true;
    }

    this.notify();
    return this.agents;
  }

  killSwitch(): void {
    for (const agent of this.agents) {
      agent.status = "frozen";
    }
    this.notify();
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }
}
