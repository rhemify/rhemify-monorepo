import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useTraceByTraceId,
  type TraceWithEvent,
  type PolicyRule,
  type Alternative,
} from "@/lib/hooks";

export const Route = createFileRoute("/dashboard/traces/$traceId")({
  component: TraceDetail,
});

/**
 * Full decision-context view for a single trace. Mirrors the
 * `rhemify traces show <trace_id>` CLI render (seven sections, top-to-bottom):
 *
 *   TRACE / EVENT / POLICY / PATH / SNAPSHOT / VERIFIABILITY / NEXT
 *
 * Same Convex query (`traces:getByTraceId`) so the dashboard and the CLI
 * stay structurally identical. No mock data, no demo paths — every byte
 * here was produced by a real `rhemify pay` invocation that ingested into
 * Convex via the Go server.
 */
function TraceDetail() {
  const { traceId } = Route.useParams();
  const { data: trace, isLoading, notFound } = useTraceByTraceId(traceId);

  if (isLoading) {
    return <CenterMessage message="Loading…" />;
  }
  if (notFound || !trace) {
    return (
      <CenterMessage
        message={`No trace found with id ${traceId}`}
        action={
          <Link to="/dashboard/traces" className="text-[var(--color-rhm-accent)] hover:underline">
            ← Browse all traces
          </Link>
        }
      />
    );
  }

  const blocked = trace.policy_rules_fired.some((r) => normalizeRule(r).result === "block");

  return (
    <div className="space-y-7 max-w-[1100px]">
      <Section title="Trace">
        <Row label="trace_id" value={<span className="font-mono">{trace.trace_id}</span>} />
        <Row
          label="decision"
          value={
            blocked ? (
              <Badge color="danger">BLOCKED</Badge>
            ) : (
              <Badge color="success">ALLOWED</Badge>
            )
          }
        />
        <Row label="at" value={formatFullTimestamp(trace._creationTime)} />
        <Row label="confidence" value={trace.confidence} />
      </Section>

      <Section title="Event">
        {trace.payment_event ? (
          <>
            <Row
              label="agent"
              value={<span className="font-mono text-[12px]">{trace.payment_event.agent_id}</span>}
            />
            <Row
              label="fleet"
              value={<span className="font-mono text-[12px]">{trace.payment_event.fleet_id}</span>}
            />
            <Row label="vendor" value={trace.payment_event.domain} />
            <Row
              label="amount"
              value={
                <span className="font-mono">
                  ${trace.payment_event.amount.toFixed(4)} {trace.payment_event.token} on{" "}
                  <span className="text-muted-foreground">{trace.payment_event.chain}</span>
                </span>
              }
            />
            <Row
              label="standard"
              value={<span className="font-mono uppercase">{trace.payment_event.standard}</span>}
            />
            <Row label="outcome" value={<OutcomeText outcome={trace.payment_event.outcome} />} />
            {trace.agent_task_context && (
              <Row label="agent context" value={trace.agent_task_context} />
            )}
          </>
        ) : (
          <Row
            label="status"
            value={
              <span className="text-[var(--color-rhm-danger)]">
                payment_event missing — trace orphaned
              </span>
            }
          />
        )}
      </Section>

      <Section title="Policy" subtitle={`${trace.policy_rules_fired.length} rules evaluated`}>
        <div className="space-y-1">
          {trace.policy_rules_fired.map((rule, i) => (
            <PolicyRuleRow key={`${rule.rule}-${i}`} rule={rule} />
          ))}
        </div>
      </Section>

      <Section title="Path selection">
        <PathSelectionRows trace={trace} />
      </Section>

      <Section title="Snapshot" subtitle="captured state at decision time">
        <SnapshotRows trace={trace} />
      </Section>

      <Section title="Verifiability">
        <Row
          label="trace hash"
          value={<span className="font-mono text-[11px] break-all">{trace.trace_hash}</span>}
        />
        <TxRow label="payment tx" sig={trace.payment_tx_hash} />
        <TxRow label="anchor tx" sig={trace.anchor_tx_hash} />
        {!trace.anchor_tx_hash && (
          <Row
            label="anchor status"
            value={
              <span className="text-muted-foreground">
                not anchored yet (run `rhemify traces verify {trace.trace_id}` to anchor on devnet)
              </span>
            }
          />
        )}
      </Section>

      <Section title="Next">
        <div className="text-[12px] text-muted-foreground space-y-1.5">
          <div>Counterfactual replay via CLI:</div>
          <CodeLine>{`rhemify traces replay ${trace.trace_id} --override daily_limit=1`}</CodeLine>
          <CodeLine>
            {`rhemify traces replay ${trace.trace_id} --override 'domain_allowlist=-${trace.payment_event?.domain ?? "<domain>"}'`}
          </CodeLine>
        </div>
      </Section>
    </div>
  );
}

// --- subcomponents ---

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-[11px] font-mono uppercase tracking-[0.08em] text-[var(--color-rhm-accent)]">
          {title}
        </h2>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
      </div>
      <div className="bg-card border border-border rounded-xl px-5 py-4 text-[13px]">
        {children}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline py-1.5">
      <span className="w-36 shrink-0 text-[11px] font-mono uppercase tracking-[0.04em] text-white/30">
        {label}
      </span>
      <span className="flex-1 min-w-0">{value}</span>
    </div>
  );
}

function Badge({ color, children }: { color: "success" | "danger" | "warning"; children: string }) {
  const bg =
    color === "success"
      ? "bg-[var(--color-rhm-success)]/15 text-[var(--color-rhm-success)]"
      : color === "danger"
        ? "bg-[var(--color-rhm-danger)]/15 text-[var(--color-rhm-danger)]"
        : "bg-[var(--color-rhm-warning)]/15 text-[var(--color-rhm-warning)]";
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-mono font-medium ${bg}`}
    >
      {children}
    </span>
  );
}

function OutcomeText({ outcome }: { outcome: string }) {
  if (outcome === "success") return <span className="text-[var(--color-rhm-success)]">success</span>;
  if (outcome === "rejected") return <span className="text-[var(--color-rhm-danger)]">rejected</span>;
  if (outcome === "failed") return <span className="text-[var(--color-rhm-warning)]">failed</span>;
  return <span className="text-muted-foreground">{outcome}</span>;
}

function normalizeRule(r: PolicyRule) {
  const raw = r.result ?? r.decision ?? "pass";
  let result: "pass" | "block" | "flag" | "skipped" = "pass";
  if (raw === "block") result = "block";
  else if (raw === "flag") result = "flag";
  else if (raw === "skipped") result = "skipped";
  return {
    rule: r.rule,
    result,
    threshold: r.threshold ?? "",
    value: r.value ?? r.actual ?? "",
  };
}

function PolicyRuleRow({ rule }: { rule: PolicyRule }) {
  const n = normalizeRule(rule);
  const icon =
    n.result === "pass"
      ? "✓"
      : n.result === "block"
        ? "✗"
        : n.result === "flag"
          ? "!"
          : "·";
  const iconColor =
    n.result === "pass"
      ? "text-[var(--color-rhm-success)]"
      : n.result === "block"
        ? "text-[var(--color-rhm-danger)]"
        : n.result === "flag"
          ? "text-[var(--color-rhm-warning)]"
          : "text-white/40";

  return (
    <div className="grid grid-cols-[20px_1fr_70px_2fr] items-baseline gap-2 text-[12px]">
      <span className={`${iconColor} font-mono`}>{icon}</span>
      <span className="font-mono text-[11px]">{n.rule}</span>
      <span className={`font-mono text-[10px] uppercase ${iconColor}`}>{n.result}</span>
      <span className="text-muted-foreground text-[11px] truncate">
        threshold {n.threshold} · actual {n.value}
      </span>
    </div>
  );
}

function PathSelectionRows({ trace }: { trace: TraceWithEvent }) {
  const isl = trace.instrument_selection_log;

  return (
    <>
      {typeof isl === "string" && isl ? (
        <Row label="log" value={isl} />
      ) : (
        isl && typeof isl === "object" && (
          <>
            <Row
              label="selected"
              value={
                isl.selected === "none" ? (
                  <span className="text-[var(--color-rhm-danger)]">none</span>
                ) : (
                  <span className="text-[var(--color-rhm-accent)] font-mono">{isl.selected}</span>
                )
              }
            />
            <Row label="reason" value={isl.reason} />
          </>
        )
      )}
      {Array.isArray(trace.alternatives_evaluated) && trace.alternatives_evaluated.length > 0 && (
        <Row
          label="alternatives"
          value={
            <div className="space-y-0.5">
              {trace.alternatives_evaluated.map((alt, i) => (
                <AlternativeRow key={`${alt.instrument}-${i}`} alt={alt} />
              ))}
            </div>
          }
        />
      )}
    </>
  );
}

function AlternativeRow({ alt }: { alt: Alternative }) {
  return (
    <div className="text-[11px] font-mono flex items-baseline gap-3">
      <span className="w-20 truncate">{alt.instrument}</span>
      {alt.available ? (
        <span className="text-[var(--color-rhm-success)]">avail</span>
      ) : (
        <span className="text-muted-foreground">unavail</span>
      )}
      <span className="text-white/40 truncate">
        {alt.available
          ? `score ${alt.score?.toFixed(2) ?? "?"}${alt.estimated_cost != null ? `, est $${alt.estimated_cost.toFixed(4)}` : ""}`
          : (alt.reason ?? "")}
      </span>
    </div>
  );
}

function SnapshotRows({ trace }: { trace: TraceWithEvent }) {
  const snap = trace.replay_snapshot ?? {};
  const ps = snap.policy_state ?? {};
  const parts: string[] = [];
  if (typeof ps.daily_limit === "number") parts.push(`daily_limit=${ps.daily_limit}`);
  if (typeof ps.max_per_transaction === "number") parts.push(`max_per_tx=${ps.max_per_transaction}`);
  if (typeof ps.approval_threshold === "number") parts.push(`approval=${ps.approval_threshold}`);
  if (Array.isArray(ps.domain_allowlist))
    parts.push(`allowlist=${ps.domain_allowlist.length} domains`);
  if (Array.isArray(ps.allowed_standards))
    parts.push(`standards=[${ps.allowed_standards.join(",")}]`);
  const vendorCount = Object.keys(snap.vendor_registry_snapshot ?? {}).length;
  const spendToday = snap.agent_context?.spend_today ?? 0;

  return (
    <>
      <Row
        label="policy"
        value={
          <span className="font-mono text-[11px]">
            {parts.length > 0 ? parts.join("  ") : (
              <span className="text-muted-foreground">(empty — SDK policy state not populated)</span>
            )}
          </span>
        }
      />
      <Row label="vendors" value={`${vendorCount} in registry`} />
      <Row label="agent ctx" value={`spend_today=$${spendToday.toFixed(2)}`} />
    </>
  );
}

function TxRow({ label, sig }: { label: string; sig: string | null | undefined }) {
  if (!sig) {
    return <Row label={label} value={<span className="text-muted-foreground">—</span>} />;
  }
  const explorer = `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  return (
    <Row
      label={label}
      value={
        <a
          href={explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] text-[var(--color-rhm-accent)] hover:underline break-all"
        >
          {sig}
        </a>
      }
    />
  );
}

function CodeLine({ children }: { children: React.ReactNode }) {
  return (
    <code className="block bg-white/[0.04] border border-border rounded px-2.5 py-1.5 text-[11px] font-mono text-foreground">
      {children}
    </code>
  );
}

function CenterMessage({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-[13px] text-muted-foreground">
      <div>{message}</div>
      {action}
    </div>
  );
}

function formatFullTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}
