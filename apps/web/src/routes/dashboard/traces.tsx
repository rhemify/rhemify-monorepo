import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTraces, type TraceListRow } from "@/lib/hooks";

export const Route = createFileRoute("/dashboard/traces")({
  component: TracesList,
});

/**
 * Decision-trace browse view. Read-only mirror of the `rhemify traces list`
 * CLI command, backed by the same Convex `traces:listAll` query. Each row
 * deep-links to the detail view at `/dashboard/traces/$traceId` which
 * matches the CLI's `rhemify traces show <id>` rendering.
 */
function TracesList() {
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [limit, setLimit] = useState(20);
  const { data: rows, isLoading } = useTraces({ blockedOnly, limit });

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-foreground">Decision traces</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Audit trail of every payment decision — policy rules fired, path chosen, settlement
            hash, on-chain anchor.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[12px]">
          <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={blockedOnly}
              onChange={(e) => setBlockedOnly(e.target.checked)}
              className="accent-[var(--color-rhm-accent)]"
            />
            blocked only
          </label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="bg-card border border-border rounded-md px-2 py-1 text-[12px] text-foreground"
          >
            <option value={20}>20 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
          </select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1.8fr_1fr_1.3fr_1fr_0.6fr_0.7fr_0.7fr_0.7fr] h-9 items-center px-5 text-[11px] font-mono uppercase tracking-[0.05em] text-white/25 bg-white/[0.02]">
          <span>trace_id</span>
          <span>when</span>
          <span>agent</span>
          <span>vendor</span>
          <span>std</span>
          <span>amount</span>
          <span>decision</span>
          <span>outcome</span>
        </div>

        {isLoading && <EmptyState message="Loading…" />}
        {!isLoading && rows && rows.length === 0 && (
          <EmptyState message="No traces yet. Run `rhemify pay <url>` or wait for an agent to settle a payment." />
        )}
        {rows?.map((row) => <TraceRow key={row._id} row={row} />)}
      </div>
    </div>
  );
}

function TraceRow({ row }: { row: TraceListRow }) {
  return (
    <Link
      to="/dashboard/traces/$traceId"
      params={{ traceId: row.trace_id }}
      className="grid grid-cols-[1.8fr_1fr_1.3fr_1fr_0.6fr_0.7fr_0.7fr_0.7fr] h-11 items-center px-5 text-[12px] no-underline text-foreground border-t border-border hover:bg-white/[0.03] transition-colors duration-100"
    >
      <span className="font-mono text-[11px] text-[var(--color-rhm-accent)] truncate pr-3">
        {row.trace_id}
      </span>
      <span className="text-muted-foreground">{formatTimestamp(row._creationTime)}</span>
      <span className="font-mono text-[11px] text-muted-foreground truncate pr-3">
        {row.agent_id ?? "—"}
      </span>
      <span className="truncate pr-3">{row.domain ?? "—"}</span>
      <span className="text-muted-foreground uppercase font-mono text-[10px]">
        {row.standard ?? "—"}
      </span>
      <span className="font-mono text-[11px]">
        {row.amount != null ? `$${row.amount.toFixed(4)}` : "—"}
      </span>
      <DecisionBadge decision={row.decision} />
      <OutcomeBadge outcome={row.outcome} />
    </Link>
  );
}

function DecisionBadge({ decision }: { decision: "allowed" | "blocked" }) {
  if (decision === "blocked") {
    return <span className="text-[11px] font-mono text-[var(--color-rhm-danger)]">blocked</span>;
  }
  return <span className="text-[11px] font-mono text-[var(--color-rhm-success)]">allowed</span>;
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (outcome === "success") {
    return <span className="text-[11px] font-mono text-[var(--color-rhm-success)]">success</span>;
  }
  if (outcome === "rejected") {
    return <span className="text-[11px] font-mono text-[var(--color-rhm-danger)]">rejected</span>;
  }
  if (outcome === "failed") {
    return <span className="text-[11px] font-mono text-[var(--color-rhm-warning)]">failed</span>;
  }
  return <span className="text-[11px] font-mono text-white/40">{outcome ?? "—"}</span>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-5 py-10 text-center text-[13px] text-muted-foreground border-t border-border">
      {message}
    </div>
  );
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${M}-${D} ${h}:${m}`;
}
