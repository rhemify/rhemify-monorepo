import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// FRONTEND QUERIES — @junshen these are ready for the dashboard
//
// Agent Spend Overview: useQuery(api.aggregates.listAgentsByFleet, { fleet_id })
// Fleet Spend Card:     useQuery(api.aggregates.getFleetAggregates, { fleet_id })
// Single Agent Detail:  useQuery(api.aggregates.getAgentAggregates, { agent_id })
// Edge Stats (graphs):  useQuery(api.aggregates.getEdgeStats, { agent_id, domain })
// Payment Graph:        useQuery(api.aggregates.listEdgesByAgent, { agent_id })
//
// These return real spend data from the intelligence pipeline.
// The old `fleet.getStats` and `transactions.list` are mock data —
// use these queries instead for the real intelligence dashboard.
// ============================================================================

// EMA smoothing factor (alpha=0.2 gives ~5-period effective window;
// fields named "7d" are approximate rolling averages, not true 7-day windows)
const ALPHA = 0.2;

// Called after every payment ingest to maintain per-agent spend aggregates.
export const updateAgent = internalMutation({
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
export const updateFleet = internalMutation({
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
export const upsertEdge = internalMutation({
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

// Combined mutation: updates all derived data (vendor, agent, fleet, edge) in one transaction.
// Called once per ingest instead of 4 separate mutations, saving 3 HTTP round-trips.
export const updateAllDerived = internalMutation({
  args: {
    agent_id: v.string(),
    fleet_id: v.string(),
    domain: v.string(),
    amount: v.number(),
    outcome: v.string(),
    standard: v.string(),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().slice(0, 10);
    const now = Date.now();
    const isSuccess = args.outcome === "success";
    const ONE_HOUR = 60 * 60 * 1000;

    // --- Vendor registry ---
    const vendor = await ctx.db
      .query("vendor_registry")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique();

    if (!vendor) {
      await ctx.db.insert("vendor_registry", {
        domain: args.domain,
        supported_standards: [args.standard],
        success_rate: isSuccess ? 1.0 : 0.0,
        avg_latency_ms: 0,
        uptime_pct: isSuccess ? 100 : 0,
        total_payments: 1,
        total_successes: isSuccess ? 1 : 0,
        last_seen_at: now,
      });
    } else {
      const standards: string[] = vendor.supported_standards ?? [];
      if (!standards.includes(args.standard)) {
        standards.push(args.standard);
      }
      const totalPayments = vendor.total_payments + 1;
      const totalSuccesses =
        (vendor.total_successes ?? 0) + (isSuccess ? 1 : 0);
      const successRate = totalSuccesses / totalPayments;

      await ctx.db.patch(vendor._id, {
        supported_standards: standards,
        success_rate: successRate,
        total_payments: totalPayments,
        total_successes: totalSuccesses,
        uptime_pct: successRate * 100,
        last_seen_at: now,
      });
    }

    // --- Agent aggregates ---
    const agent = await ctx.db
      .query("agent_aggregates")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .unique();

    if (!agent) {
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
        last_active: now,
      });
    } else {
      let dailySpend = agent.daily_spend;
      let avgDaily7d = agent.avg_daily_7d;
      let activeDays = agent.active_days;

      if (agent.daily_spend_date !== today) {
        avgDaily7d =
          ALPHA * agent.daily_spend + (1 - ALPHA) * agent.avg_daily_7d;
        dailySpend = isSuccess ? args.amount : 0;
        activeDays = agent.active_days + 1;
      } else {
        dailySpend = isSuccess
          ? agent.daily_spend + args.amount
          : agent.daily_spend;
      }

      await ctx.db.patch(agent._id, {
        daily_spend: dailySpend,
        daily_spend_date: today,
        avg_daily_7d: avgDaily7d,
        avg_tx_amount:
          ALPHA * args.amount + (1 - ALPHA) * agent.avg_tx_amount,
        total_events: agent.total_events + 1,
        active_days: activeDays,
        success_rate:
          ALPHA * (isSuccess ? 1.0 : 0.0) + (1 - ALPHA) * agent.success_rate,
        last_active: now,
      });
    }

    // --- Fleet aggregates ---
    const fleet = await ctx.db
      .query("fleet_aggregates")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .unique();

    if (!fleet) {
      await ctx.db.insert("fleet_aggregates", {
        fleet_id: args.fleet_id,
        hourly_spend: isSuccess ? args.amount : 0,
        hourly_spend_since: now,
        avg_hourly_7d: 0,
        total_spend_today: isSuccess ? args.amount : 0,
        today_date: today,
      });
    } else {
      let hourlySpend = fleet.hourly_spend;
      let hourlySpendSince = fleet.hourly_spend_since;
      let avgHourly7d = fleet.avg_hourly_7d;
      let totalSpendToday = fleet.total_spend_today;

      if (fleet.today_date !== today) {
        totalSpendToday = isSuccess ? args.amount : 0;
      } else {
        totalSpendToday = isSuccess
          ? fleet.total_spend_today + args.amount
          : fleet.total_spend_today;
      }

      if (now - fleet.hourly_spend_since > ONE_HOUR) {
        avgHourly7d =
          ALPHA * fleet.hourly_spend + (1 - ALPHA) * fleet.avg_hourly_7d;
        hourlySpend = isSuccess ? args.amount : 0;
        hourlySpendSince = now;
      } else {
        hourlySpend = isSuccess
          ? fleet.hourly_spend + args.amount
          : fleet.hourly_spend;
      }

      await ctx.db.patch(fleet._id, {
        hourly_spend: hourlySpend,
        hourly_spend_since: hourlySpendSince,
        avg_hourly_7d: avgHourly7d,
        total_spend_today: totalSpendToday,
        today_date: today,
      });
    }

    // --- Payment edge ---
    const edge = await ctx.db
      .query("payment_edges")
      .withIndex("by_agent_service", (q) =>
        q.eq("from_agent_id", args.agent_id).eq("to_service", args.domain)
      )
      .unique();

    if (!edge) {
      await ctx.db.insert("payment_edges", {
        from_agent_id: args.agent_id,
        to_service: args.domain,
        delegation_depth: 0,
        cumulative_spend: isSuccess ? args.amount : 0,
        event_count: 1,
        last_seen_at: now,
      });
    } else {
      await ctx.db.patch(edge._id, {
        cumulative_spend: isSuccess
          ? edge.cumulative_spend + args.amount
          : edge.cumulative_spend,
        event_count: (edge.event_count ?? 0) + 1,
        last_seen_at: now,
      });
    }
  },
});

// ============================================================================
// QUERIES — used by both Go server (engine context) and frontend (dashboard)
// ============================================================================

// Read agent aggregates. Used by rules engine AND agent detail page.
export const getAgentAggregates = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agent_aggregates")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agent_id))
      .unique();
  },
});

// Read fleet aggregates. Used by rules engine AND fleet dashboard.
export const getFleetAggregates = query({
  args: { fleet_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fleet_aggregates")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .unique();
  },
});

// Read (agent, domain) edge stats. Used by SA-2 rule AND payment graph.
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

// List all agents' spend aggregates for a fleet. Powers the agent spend overview table.
export const listAgentsByFleet = query({
  args: { fleet_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agent_aggregates")
      .withIndex("by_fleet", (q) => q.eq("fleet_id", args.fleet_id))
      .collect();
  },
});

// List all payment edges for an agent. Powers the "who pays whom" payment graph.
export const listEdgesByAgent = query({
  args: { agent_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payment_edges")
      .withIndex("by_agent", (q) => q.eq("from_agent_id", args.agent_id))
      .collect();
  },
});
