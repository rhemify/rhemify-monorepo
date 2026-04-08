import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const ALPHA = 0.2; // EMA smoothing factor

// Called after every payment ingest to maintain per-agent spend aggregates.
export const updateAgent = mutation({
  args: {
    agent_id: v.string(),
    fleet_id: v.string(),
    amount: v.number(),
    outcome: v.string(),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().slice(0, 10);
    const isSuccess = args.outcome === "success";

    const existing = await ctx.db
      .query("agent_aggregates")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .unique();

    if (!existing) {
      await ctx.db.insert("agent_aggregates", {
        agent_id: args.agent_id,
        fleet_id: args.fleet_id,
        daily_spend: isSuccess ? args.amount : 0,
        daily_spend_date: today,
        avg_daily_7d: 0,
        avg_tx_amount: args.amount,
        total_events: 1,
        active_days: 1,
        success_rate: isSuccess ? 1.0 : 0.0,
        last_active: Date.now(),
      });
      return;
    }

    let daily_spend = existing.daily_spend;
    let avg_daily_7d = existing.avg_daily_7d;
    let active_days = existing.active_days;

    // Day rollover: apply yesterday's total to EMA, reset daily counter
    if (existing.daily_spend_date !== today) {
      avg_daily_7d =
        ALPHA * existing.daily_spend + (1 - ALPHA) * existing.avg_daily_7d;
      daily_spend = isSuccess ? args.amount : 0;
      active_days = existing.active_days + 1;
    } else {
      daily_spend = isSuccess
        ? existing.daily_spend + args.amount
        : existing.daily_spend;
    }

    const avg_tx_amount =
      ALPHA * args.amount + (1 - ALPHA) * existing.avg_tx_amount;
    const successVal = isSuccess ? 1.0 : 0.0;
    const success_rate =
      ALPHA * successVal + (1 - ALPHA) * existing.success_rate;

    await ctx.db.patch(existing._id, {
      daily_spend,
      daily_spend_date: today,
      avg_daily_7d,
      avg_tx_amount,
      total_events: existing.total_events + 1,
      active_days,
      success_rate,
      last_active: Date.now(),
    });
  },
});

// Called after every payment ingest to maintain per-fleet spend aggregates.
export const updateFleet = mutation({
  args: {
    fleet_id: v.string(),
    amount: v.number(),
    outcome: v.string(),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().slice(0, 10);
    const now = Date.now();
    const isSuccess = args.outcome === "success";
    const ONE_HOUR = 60 * 60 * 1000;

    const existing = await ctx.db
      .query("fleet_aggregates")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .unique();

    if (!existing) {
      await ctx.db.insert("fleet_aggregates", {
        fleet_id: args.fleet_id,
        hourly_spend: isSuccess ? args.amount : 0,
        hourly_spend_since: now,
        avg_hourly_7d: 0,
        total_spend_today: isSuccess ? args.amount : 0,
        today_date: today,
      });
      return;
    }

    let hourly_spend = existing.hourly_spend;
    let hourly_spend_since = existing.hourly_spend_since;
    let avg_hourly_7d = existing.avg_hourly_7d;
    let total_spend_today = existing.total_spend_today;

    // Day rollover
    if (existing.today_date !== today) {
      total_spend_today = isSuccess ? args.amount : 0;
    } else {
      total_spend_today = isSuccess
        ? existing.total_spend_today + args.amount
        : existing.total_spend_today;
    }

    // Hourly window rollover: apply completed window to EMA, start fresh
    if (now - existing.hourly_spend_since > ONE_HOUR) {
      avg_hourly_7d =
        ALPHA * existing.hourly_spend + (1 - ALPHA) * existing.avg_hourly_7d;
      hourly_spend = isSuccess ? args.amount : 0;
      hourly_spend_since = now;
    } else {
      hourly_spend = isSuccess
        ? existing.hourly_spend + args.amount
        : existing.hourly_spend;
    }

    await ctx.db.patch(existing._id, {
      hourly_spend,
      hourly_spend_since,
      avg_hourly_7d,
      total_spend_today,
      today_date: today,
    });
  },
});

// Upserts the payment_edges graph on every ingest.
export const upsertEdge = mutation({
  args: {
    agent_id: v.string(),
    domain: v.string(),
    amount: v.number(),
    outcome: v.string(),
  },
  handler: async (ctx, args) => {
    const isSuccess = args.outcome === "success";
    const existing = await ctx.db
      .query("payment_edges")
      .withIndex("by_agent_service", (q) =>
        q.eq("from_agent_id", args.agent_id).eq("to_service", args.domain)
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("payment_edges", {
        from_agent_id: args.agent_id,
        to_service: args.domain,
        delegation_depth: 0,
        cumulative_spend: isSuccess ? args.amount : 0,
        event_count: 1,
        last_seen_at: Date.now(),
      });
      return;
    }

    await ctx.db.patch(existing._id, {
      cumulative_spend: isSuccess
        ? existing.cumulative_spend + args.amount
        : existing.cumulative_spend,
      event_count: (existing.event_count ?? 0) + 1,
      last_seen_at: Date.now(),
    });
  },
});

// Read agent aggregates for rules engine context.
export const getAgentAggregates = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agent_aggregates")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .unique();
  },
});

// Read fleet aggregates for rules engine context.
export const getFleetAggregates = query({
  args: { fleet_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fleet_aggregates")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .unique();
  },
});

// Read (agent, domain) edge stats for SA-2 vendor context.
export const getEdgeStats = query({
  args: { agent_id: v.string(), domain: v.string() },
  handler: async (ctx, args) => {
    const edge = await ctx.db
      .query("payment_edges")
      .withIndex("by_agent_service", (q) =>
        q
          .eq("from_agent_id", args.agent_id)
          .eq("to_service", args.domain)
      )
      .unique();

    if (!edge) return null;

    const eventCount = edge.event_count ?? 0;
    return {
      event_count: eventCount,
      avg_payment: eventCount > 0 ? edge.cumulative_spend / eventCount : 0,
    };
  },
});
