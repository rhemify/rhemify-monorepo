/**
 * Convex polling client for the TUI.
 *
 * Why polling vs reactive subscription: Convex's reactive client expects
 * a browser-like WebSocket runtime. From Node/Bun we use ConvexHttpClient
 * and poll on a tick. For a demo TUI this is fine — 2s cadence keeps the
 * panels feeling live without saturating the local backend.
 */

import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? "http://127.0.0.1:3212";

export const convex = new ConvexHttpClient(url);
export const CONVEX_URL = url;

/** Convex query names used by the TUI panels. */
export const Q = {
  agents: "agents:listAll" as const,
  transactions: "transactions:listAll" as const,
  intelligence: "intelligence:listActions" as const,
};

export interface FleetRow {
  _id: string;
  email: string;
  company_name: string;
  role: "solo-founder" | "small-team" | "enterprise";
  monthly_spend_cap: number;
  is_deployed: boolean;
  _creationTime: number;
}

export interface AgentRow {
  _id: string;
  fleet_id: string;
  agent_key: string;
  name: string;
  status: "running" | "paused" | "frozen";
  primary_standard: "mpp" | "x402" | "l402" | "ap2";
  spent_today: number;
  daily_limit: number;
  tasks_completed: number;
}

export interface TransactionRow {
  _id: string;
  agent_name: string;
  vendor: string;
  domain: string;
  amount: number;
  standard: "mpp" | "x402" | "l402" | "ap2";
  status: "completed" | "blocked" | "pending";
  _creationTime: number;
}

export interface IntelligenceActionRow {
  _id: string;
  action_type: "auto_block" | "auto_flag" | "auto_alert" | "recommend" | "auto_route";
  trigger_rule: string;
  outcome: "pending" | "applied" | "dismissed" | "reversed";
  severity?: string;
  action_detail?: string;
  _creationTime: number;
}

export interface AnchorBatchRow {
  _id: string;
  fleet_id: string;
  date: string;
  trace_count: number;
  status: "pending" | "anchored" | "failed";
  tx_hash?: string;
}
