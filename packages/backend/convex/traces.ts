import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Confidence } from "./schema";

// GET /api/traces/:id
export const get = query({
  args: { id: v.id("payment_traces") },
  handler: async (ctx, args) => {
    const trace = await ctx.db.get(args.id);
    if (!trace) return null;

    const event = await ctx.db.get(trace.payment_event_id);

    return {
      ...trace,
      payment_event: event,
    };
  },
});

// Look up a trace by its human-readable `trace_id` field (e.g.
// "trc_seed_1778482712054_8"). CLI consumers copy this string out of the
// `traces list` output — they don't have the Convex internal _id.
// Uses the existing `by_trace_id` index.
export const getByTraceId = query({
  args: { trace_id: v.string() },
  handler: async (ctx, args) => {
    const trace = await ctx.db
      .query("payment_traces")
      .withIndex("by_trace_id", (q) => q.eq("trace_id", args.trace_id))
      .unique();
    if (!trace) return null;

    const event = await ctx.db.get(trace.payment_event_id);
    return {
      ...trace,
      payment_event: event,
    };
  },
});

// listAll — browse-first surface for the CLI / TUI / dashboard.
//
// Server-side joins each trace to its payment_event to fold the most
// "decision-summary-relevant" fields (agent, vendor, amount, outcome) into
// a flat row shape consumers can render directly. Also computes a
// `decision` field ("allowed" | "blocked") by inspecting policy_rules_fired
// so consumers don't have to walk the rules array themselves just to filter.
//
// Optional filters are post-applied (after over-fetch) because the indexes
// we have don't cover (blocked_only, agent_id). Cap at 100 to keep the
// over-fetch bounded.
export const listAll = query({
  args: {
    limit: v.optional(v.float64()),
    agent_id: v.optional(v.string()),
    blocked_only: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 100);

    // Over-fetch when filtering so the cap still yields `limit` matches.
    const overscan = args.agent_id || args.blocked_only ? limit * 3 : limit;
    const traces = await ctx.db.query("payment_traces").order("desc").take(overscan);

    const enriched = await Promise.all(
      traces.map(async (t) => {
        const event = await ctx.db.get(t.payment_event_id);
        const rulesFired = Array.isArray(t.policy_rules_fired)
          ? (t.policy_rules_fired as Array<{ rule: string; result: string }>)
          : [];
        const decision: "allowed" | "blocked" = rulesFired.some(
          (r) => r.result === "block",
        )
          ? "blocked"
          : "allowed";

        return {
          _id: t._id,
          trace_id: t.trace_id,
          _creationTime: t._creationTime,
          confidence: t.confidence,
          decision,
          payment_event_id: t.payment_event_id,
          agent_id: event?.agent_id ?? null,
          domain: event?.domain ?? null,
          amount: event?.amount ?? null,
          standard: event?.standard ?? null,
          outcome: event?.outcome ?? null,
          anchor_tx_hash: t.anchor_tx_hash ?? null,
        };
      }),
    );

    let filtered = enriched;
    if (args.agent_id) {
      filtered = filtered.filter((e) => e.agent_id === args.agent_id);
    }
    if (args.blocked_only) {
      filtered = filtered.filter((e) => e.decision === "blocked");
    }

    return filtered.slice(0, limit);
  },
});

// Insert a payment trace (called by Go server after ingest)
export const insert = mutation({
  args: {
    id: v.string(),
    payment_event_id: v.optional(v.id("payment_events")),
    trace_id: v.optional(v.string()),
    agent_task_context: v.string(),
    trigger_402_raw: v.string(),
    alternatives_evaluated: v.any(),
    policy_rules_fired: v.any(),
    instrument_selection_log: v.any(),
    confidence: Confidence,
    replay_snapshot: v.any(),
    trace_hash: v.string(),
    payment_tx_hash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find the payment event by trace_id to link them
    let paymentEventId = args.payment_event_id;
    if (!paymentEventId && args.id) {
      const events = await ctx.db
        .query("payment_events")
        .withIndex("by_trace", (q) => q.eq("trace_id", args.id))
        .collect();
      if (events.length > 0) {
        paymentEventId = events[0]!._id;
      }
    }

    if (!paymentEventId) {
      throw new Error("Cannot insert trace: no linked payment event found");
    }

    const traceDoc = await ctx.db.insert("payment_traces", {
      payment_event_id: paymentEventId,
      trace_id: args.id,
      agent_task_context: args.agent_task_context,
      trigger_402_raw: args.trigger_402_raw,
      alternatives_evaluated: args.alternatives_evaluated,
      policy_rules_fired: args.policy_rules_fired,
      instrument_selection_log: args.instrument_selection_log,
      confidence: args.confidence,
      replay_snapshot: args.replay_snapshot,
      trace_hash: args.trace_hash,
      payment_tx_hash: args.payment_tx_hash,
    });

    return traceDoc;
  },
});

// Fetch trace + linked event by trace_id string for the replay engine.
// Returns full replay_snapshot and policy_rules_fired needed for counterfactual analysis.
export const getForReplay = query({
  args: { trace_id: v.string() },
  handler: async (ctx, args) => {
    const trace = await ctx.db
      .query("payment_traces")
      .withIndex("by_trace_id", (q) => q.eq("trace_id", args.trace_id))
      .unique();
    if (!trace) return null;

    const event = await ctx.db.get(trace.payment_event_id);
    return { trace, event };
  },
});

// GET (via Go merkle-proof handler) — list a fleet's traces for a UTC date,
// ordered by _creationTime ascending. The leaf index of each trace in the
// Merkle tree is its position in this list, so the ordering must be stable
// (always insertion order). Date is "YYYY-MM-DD" UTC, the same format
// `rhemify traces verify` uses as the daily anchor PDA seed.
//
// Walks every payment_event for the fleet via by_fleet index, filters to
// the date window in-memory, then joins each event to its trace. Filter
// in-memory because Convex indexes can't compose (fleet_id, time_range)
// without a stale prefix-index that doubles index storage. Fleet sizes in
// v1 (hundreds of payments/day) keep this cheap; if a fleet ever scales
// to 10k+/day, add a dedicated by_fleet_date materialized index.
export const listByFleetDate = query({
  args: {
    fleet_id: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    // [startMs, endMs) for the UTC day.
    const day = Date.parse(`${args.date}T00:00:00Z`);
    if (Number.isNaN(day)) {
      throw new Error(`listByFleetDate: invalid date '${args.date}', expected YYYY-MM-DD`);
    }
    const endMs = day + 24 * 60 * 60 * 1000;

    const events = await ctx.db
      .query("payment_events")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .collect();

    const dayEvents = events.filter(
      (e) => e._creationTime >= day && e._creationTime < endMs,
    );
    // Stable order = insertion order = leaf index.
    dayEvents.sort((a, b) => a._creationTime - b._creationTime);

    // Only include traces whose trace_hash is a real 64-char hex SHA-256.
    // Pre-O.1 seed.ts generated synthetic trace_hashes like
    // "sha256_seed_0_<...>" which aren't valid leaf bytes; including them
    // breaks tree construction in the Go handler. Real SDK output always
    // produces 64-hex.
    const HEX64 = /^[0-9a-f]{64}$/;

    const out: Array<{
      trace_id: string;
      trace_hash: string;
      created_at_ms: number;
      leaf_index: number;
    }> = [];
    for (const ev of dayEvents) {
      const trace = await ctx.db
        .query("payment_traces")
        .withIndex("by_payment_event", (q) => q.eq("payment_event_id", ev._id))
        .unique();
      if (!trace) continue;
      if (!HEX64.test(trace.trace_hash)) continue;
      out.push({
        trace_id: trace.trace_id,
        trace_hash: trace.trace_hash,
        created_at_ms: ev._creationTime,
        leaf_index: out.length,
      });
    }
    return out;
  },
});

// PATCH /api/traces/:id/anchor — update trace with Memo tx signature
export const updateAnchor = mutation({
  args: {
    trace_id: v.string(),
    anchor_tx_hash: v.string(),
  },
  handler: async (ctx, args) => {
    const traces = await ctx.db
      .query("payment_traces")
      .withIndex("by_trace_id", (q) => q.eq("trace_id", args.trace_id))
      .collect();

    if (traces.length === 0) {
      throw new Error(`Trace not found: ${args.trace_id}`);
    }

    await ctx.db.patch(traces[0]!._id, {
      anchor_tx_hash: args.anchor_tx_hash,
    });

    return { ok: true };
  },
});
