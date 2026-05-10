/**
 * Rhemos TUI — terminal dashboard for the local Convex deployment.
 *
 * Layout:
 *
 *   ┌─────────────────────────┬─────────────────────────────┐
 *   │ Agent Grid              │ Intelligence Feed           │
 *   │ (status, spend, deps)   │ (rules engine actions)      │
 *   ├─────────────────────────┴─────────────────────────────┤
 *   │ Live Transaction Stream                                │
 *   │ (agent → vendor, amount, standard, status)             │
 *   └────────────────────────────────────────────────────────┘
 *
 * Polls Convex at 2Hz. Quit with Ctrl-C or 'q'.
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { convex, CONVEX_URL, Q, type AgentRow, type TransactionRow, type IntelligenceActionRow } from "./convex-client.js";

const POLL_MS = 2000;

interface DashboardData {
  agents: AgentRow[];
  transactions: TransactionRow[];
  intelligence: IntelligenceActionRow[];
  lastUpdate: number;
  error: string | null;
}

function useConvexPoll(): DashboardData {
  const [data, setData] = useState<DashboardData>({
    agents: [],
    transactions: [],
    intelligence: [],
    lastUpdate: 0,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [agents, transactions, intelligence] = await Promise.all([
          convex.query(Q.agents as never, { limit: 12 }),
          convex.query(Q.transactions as never, { limit: 12 }),
          convex.query(Q.intelligence as never, { limit: 8 }),
        ]);
        if (cancelled) return;
        setData({
          agents: agents as AgentRow[],
          transactions: transactions as TransactionRow[],
          intelligence: intelligence as IntelligenceActionRow[],
          lastUpdate: Date.now(),
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setData((prev) => ({ ...prev, error: (err as Error).message, lastUpdate: Date.now() }));
      }
    };
    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return data;
}

function StatusBadge({ status }: { status: string }) {
  const fg =
    status === "running" || status === "completed" || status === "applied" || status === "anchored"
      ? "#7CFC00"
      : status === "blocked" || status === "rejected" || status === "failed" || status === "frozen"
      ? "#FF5C5C"
      : status === "paused" || status === "pending" || status === "dismissed"
      ? "#FFD700"
      : "#909090";
  return <text fg={fg}>{status}</text>;
}

function AgentPanel({ agents }: { agents: AgentRow[] }) {
  return (
    <box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor="#3a3a3a"
      title=" Agents "
      titleAlignment="left"
      padding={1}
    >
      <text fg="#888">name              status    spent   tasks  std</text>
      <text fg="#444">────────────────  ────────  ──────  ─────  ────</text>
      {agents.slice(0, 10).map((a) => (
        <box key={a._id} flexDirection="row">
          <text fg="#E8E8E8">{a.name.padEnd(18, " ").slice(0, 18)}</text>
          <text>  </text>
          <StatusBadge status={a.status} />
          <text fg="#aaa">{" ".repeat(Math.max(0, 9 - a.status.length))}${a.spent_today.toFixed(2).padStart(5, " ")}  {String(a.tasks_completed).padStart(4, " ")}  </text>
          <text fg="#9ce">{a.primary_standard}</text>
        </box>
      ))}
      {agents.length === 0 && <text fg="#666">no agents yet — run `bun run seed`</text>}
    </box>
  );
}

function IntelligencePanel({ actions }: { actions: IntelligenceActionRow[] }) {
  return (
    <box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor="#3a3a3a"
      title=" Intelligence Feed "
      titleAlignment="left"
      padding={1}
    >
      <text fg="#888">type         rule                              outcome</text>
      <text fg="#444">───────────  ────────────────────────────────  ─────────</text>
      {actions.slice(0, 8).map((a) => (
        <box key={a._id} flexDirection="row">
          <text fg="#9ce">{a.action_type.padEnd(13, " ").slice(0, 13)}</text>
          <text fg="#E8E8E8">{a.trigger_rule.padEnd(34, " ").slice(0, 34)}</text>
          <text> </text>
          <StatusBadge status={a.outcome} />
        </box>
      ))}
      {actions.length === 0 && <text fg="#666">no actions yet</text>}
    </box>
  );
}

function TransactionPanel({ transactions }: { transactions: TransactionRow[] }) {
  return (
    <box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor="#3a3a3a"
      title=" Live Transactions "
      titleAlignment="left"
      padding={1}
    >
      <text fg="#888">agent              vendor              std   amount   status</text>
      <text fg="#444">─────────────────  ──────────────────  ────  ───────  ──────────</text>
      {transactions.slice(0, 12).map((t) => (
        <box key={t._id} flexDirection="row">
          <text fg="#E8E8E8">{t.agent_name.padEnd(19, " ").slice(0, 19)}</text>
          <text fg="#aaa">{t.vendor.padEnd(20, " ").slice(0, 20)}</text>
          <text fg="#9ce">{t.standard.padEnd(6, " ")}</text>
          <text fg="#FFD700">${t.amount.toFixed(2).padStart(6, " ")}  </text>
          <StatusBadge status={t.status} />
        </box>
      ))}
      {transactions.length === 0 && <text fg="#666">no transactions yet</text>}
    </box>
  );
}

function HeaderBar({ data }: { data: DashboardData }) {
  const lastAge = data.lastUpdate ? Math.max(0, Math.floor((Date.now() - data.lastUpdate) / 1000)) : -1;
  return (
    <box flexDirection="row" paddingLeft={1} paddingRight={1}>
      <text fg="#C8F03A">RHEMOS</text>
      <text fg="#888">  ·  </text>
      <text fg="#E8E8E8">verifiable payment layer for agentic commerce</text>
      <text fg="#888">  ·  convex:</text>
      <text fg={data.error ? "#FF5C5C" : "#7CFC00"}>
        {" "}{CONVEX_URL.replace("http://", "")}{data.error ? " (error)" : " (live)"}
      </text>
      <text fg="#888">  ·  {lastAge >= 0 ? `${lastAge}s ago` : "..."}</text>
      <text fg="#888">  ·  q to quit</text>
    </box>
  );
}

function App() {
  const data = useConvexPoll();
  const dims = useTerminalDimensions();

  useKeyboard((key) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      process.exit(0);
    }
  });

  if (data.error) {
    return (
      <box flexDirection="column" padding={2}>
        <text fg="#FF5C5C">Convex error: {data.error}</text>
        <text fg="#888"> </text>
        <text fg="#aaa">Expected convex-local on {CONVEX_URL}. From repo root:</text>
        <text fg="#9ce">  cd packages/backend</text>
        <text fg="#9ce">  bunx convex dev      # start local backend (choose "Start without an account")</text>
        <text fg="#9ce">  bun run seed         # seed demo data (from apps/tui/)</text>
        <text fg="#888"> </text>
        <text fg="#888">Press q to quit.</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" width={dims.width} height={dims.height}>
      <HeaderBar data={data} />
      <box flexDirection="row" flexGrow={1}>
        <AgentPanel agents={data.agents} />
        <IntelligencePanel actions={data.intelligence} />
      </box>
      <TransactionPanel transactions={data.transactions} />
    </box>
  );
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
