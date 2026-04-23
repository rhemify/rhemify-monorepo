import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// GET /api/anchor/:fleetId/:date — daily Merkle root info
export const getDailyRoot = query({
  args: {
    fleet_id: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("anchor_batches")
      .withIndex("by_fleet_date", (q) =>
        q.eq("fleet_id", args.fleet_id).eq("date", args.date),
      )
      .unique();
  },
});

// GET /api/anchor/verify/:traceId — trace + Merkle proof for verification
export const getVerification = query({
  args: { trace_id: v.string() },
  handler: async (ctx, args) => {
    // Find the trace
    const trace = await ctx.db
      .query("payment_traces")
      .withIndex("by_trace_id", (q) => q.eq("trace_id", args.trace_id))
      .unique();

    if (!trace) return null;

    // Find the linked payment event
    const event = await ctx.db.get(trace.payment_event_id);

    // Find the daily batch for this trace's date
    const traceDate = new Date(trace._creationTime).toISOString().split("T")[0];
    const batch = event
      ? await ctx.db
          .query("anchor_batches")
          .withIndex("by_fleet_date", (q) =>
            q.eq("fleet_id", event.fleet_id).eq("date", traceDate!),
          )
          .unique()
      : null;

    return {
      trace: {
        traceId: trace.trace_id,
        traceHash: trace.trace_hash,
        anchorTxHash: trace.anchor_tx_hash ?? null,
        confidence: trace.confidence,
        agentTaskContext: trace.agent_task_context,
      },
      event: event
        ? {
            agentId: event.agent_id,
            fleetId: event.fleet_id,
            standard: event.standard,
            amount: event.amount,
            domain: event.domain,
            outcome: event.outcome,
          }
        : null,
      merkle: batch
        ? {
            merkleRoot: batch.merkle_root,
            traceCount: batch.trace_count,
            pdaAddress: batch.pda_address ?? null,
            txHash: batch.tx_hash ?? null,
            status: batch.status,
            proof: trace.merkle_proof ?? null,
          }
        : null,
    };
  },
});

// Insert or update a daily Merkle batch (called by Go server cron)
export const upsertBatch = mutation({
  args: {
    fleet_id: v.string(),
    date: v.string(),
    merkle_root: v.string(),
    trace_count: v.float64(),
    pda_address: v.optional(v.string()),
    tx_hash: v.optional(v.string()),
    status: v.string(),
    tree_data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("anchor_batches")
      .withIndex("by_fleet_date", (q) =>
        q.eq("fleet_id", args.fleet_id).eq("date", args.date),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        merkle_root: args.merkle_root,
        trace_count: args.trace_count,
        pda_address: args.pda_address,
        tx_hash: args.tx_hash,
        status: args.status,
        tree_data: args.tree_data,
      });
      return existing._id;
    }

    return await ctx.db.insert("anchor_batches", {
      fleet_id: args.fleet_id,
      date: args.date,
      merkle_root: args.merkle_root,
      trace_count: args.trace_count,
      pda_address: args.pda_address,
      tx_hash: args.tx_hash,
      status: args.status,
      tree_data: args.tree_data,
    });
  },
});

// Get all unbatched trace hashes for a fleet+date (called by Go batch manager)
export const getUnbatchedHashes = query({
  args: {
    fleet_id: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all payment events for this fleet
    const events = await ctx.db
      .query("payment_events")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .collect();

    // Filter to this date (based on _creationTime)
    const dateStart = new Date(args.date + "T00:00:00Z").getTime();
    const dateEnd = new Date(args.date + "T23:59:59.999Z").getTime();
    const todayEvents = events.filter(
      (e) => e._creationTime >= dateStart && e._creationTime <= dateEnd,
    );

    // Get traces for these events that don't have merkle_proof yet
    const hashes: string[] = [];
    for (const event of todayEvents) {
      const traces = await ctx.db
        .query("payment_traces")
        .withIndex("by_payment_event", (q) =>
          q.eq("payment_event_id", event._id),
        )
        .collect();

      for (const trace of traces) {
        if (!trace.merkle_proof && trace.trace_hash) {
          hashes.push(trace.trace_hash);
        }
      }
    }

    return hashes;
  },
});

// Update Merkle proof on a trace by its hash (called by Go batch manager)
export const updateTraceProofByHash = mutation({
  args: {
    trace_hash: v.string(),
    merkle_proof: v.any(),
  },
  handler: async (ctx, args) => {
    const trace = await ctx.db
      .query("payment_traces")
      .withIndex("by_trace_hash", (q) => q.eq("trace_hash", args.trace_hash))
      .unique();

    if (!trace) return null;

    await ctx.db.patch(trace._id, {
      merkle_proof: args.merkle_proof,
    });

    return trace._id;
  },
});

// Update Merkle proofs on individual traces (called after batch is built)
export const updateTraceProof = mutation({
  args: {
    trace_id: v.string(),
    merkle_proof: v.any(),
  },
  handler: async (ctx, args) => {
    const trace = await ctx.db
      .query("payment_traces")
      .withIndex("by_trace_id", (q) => q.eq("trace_id", args.trace_id))
      .unique();

    if (!trace) return null;

    await ctx.db.patch(trace._id, {
      merkle_proof: args.merkle_proof,
    });

    return trace._id;
  },
});
