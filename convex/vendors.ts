import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// GET /api/vendor/:domain — vendor status for SDK policy engine
export const getByDomain = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const vendor = await ctx.db
      .query("vendor_registry")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique();

    if (!vendor) return null;

    return {
      domain: vendor.domain,
      isBlocked: vendor.is_blocked === true || vendor.success_rate < 0.5,
      blockedReason: vendor.blocked_reason ?? null,
      successRate: vendor.success_rate,
      avgLatencyMs: vendor.avg_latency_ms,
      uptimePct: vendor.uptime_pct,
      totalPayments: vendor.total_payments,
      supportedStandards: vendor.supported_standards,
    };
  },
});

// Called after every payment ingest to update vendor reliability stats.
export const updateStats = mutation({
  args: {
    domain: v.string(),
    outcome: v.string(),
    standard: v.string(),
  },
  handler: async (ctx, args) => {
    const isSuccess = args.outcome === "success";
    const now = Date.now();

    const existing = await ctx.db
      .query("vendor_registry")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique();

    if (!existing) {
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
      return;
    }

    const standards: string[] = existing.supported_standards ?? [];
    if (!standards.includes(args.standard)) {
      standards.push(args.standard);
    }

    const total_payments = existing.total_payments + 1;
    const total_successes =
      (existing.total_successes ?? 0) + (isSuccess ? 1 : 0);
    const success_rate = total_successes / total_payments;

    await ctx.db.patch(existing._id, {
      supported_standards: standards,
      success_rate,
      total_payments,
      total_successes,
      uptime_pct: success_rate * 100,
      last_seen_at: now,
    });
  },
});

// Full vendor stats for the rules engine. Computes sliding window from raw events.
export const getStatsForEngine = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const vendor = await ctx.db
      .query("vendor_registry")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique();

    // Sliding window: last 50 events within last 24h
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentEvents = await ctx.db
      .query("payment_events")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .order("desc")
      .take(50);
    const windowEvents = recentEvents.filter(
      (e) => e._creationTime >= oneDayAgo
    );

    if (windowEvents.length === 0) {
      if (!vendor) return null;
      return {
        domain: vendor.domain,
        success_rate: vendor.success_rate,
        avg_latency_ms: vendor.avg_latency_ms,
        event_count: vendor.total_payments,
        failure_streak: 0,
        last_10_outcomes: [] as string[],
        is_blocked: vendor.is_blocked ?? false,
        blocked_until: vendor.blocked_until ?? null,
        block_count_24h: vendor.block_count_24h ?? 0,
      };
    }

    const successes = windowEvents.filter(
      (e) => e.outcome === "success"
    ).length;
    const success_rate = successes / windowEvents.length;

    // Consecutive failures from most recent event
    let failure_streak = 0;
    for (const event of windowEvents) {
      if (event.outcome !== "success") failure_streak++;
      else break;
    }

    const last_10_outcomes = windowEvents.slice(0, 10).map((e) => e.outcome);

    return {
      domain: args.domain,
      success_rate,
      avg_latency_ms: vendor?.avg_latency_ms ?? 0,
      event_count: windowEvents.length,
      failure_streak,
      last_10_outcomes,
      is_blocked: vendor?.is_blocked ?? false,
      blocked_until: vendor?.blocked_until ?? null,
      block_count_24h: vendor?.block_count_24h ?? 0,
    };
  },
});

// Blocks a vendor with escalating cooldowns:
//   1st block in 24h → auto-unblock after 1h
//   2nd block in 24h → auto-unblock after 6h
//   3rd+ block in 24h → no auto-unblock (operator review required)
export const blockVendor = mutation({
  args: {
    domain: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const oneDayAgo = now - 24 * ONE_HOUR;

    const vendor = await ctx.db
      .query("vendor_registry")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique();

    const priorBlockCount =
      vendor && (vendor.last_blocked_at ?? 0) > oneDayAgo
        ? (vendor.block_count_24h ?? 0)
        : 0;

    let blocked_until: number | undefined;
    if (priorBlockCount === 0) {
      blocked_until = now + ONE_HOUR;
    } else if (priorBlockCount === 1) {
      blocked_until = now + SIX_HOURS;
    }
    // 3rd+: no auto-unblock

    if (!vendor) {
      await ctx.db.insert("vendor_registry", {
        domain: args.domain,
        supported_standards: [],
        success_rate: 0,
        avg_latency_ms: 0,
        uptime_pct: 0,
        total_payments: 0,
        total_successes: 0,
        last_seen_at: now,
        is_blocked: true,
        blocked_reason: args.reason,
        blocked_at: now,
        blocked_until,
        block_count_24h: 1,
        last_blocked_at: now,
      });
    } else {
      await ctx.db.patch(vendor._id, {
        is_blocked: true,
        blocked_reason: args.reason,
        blocked_at: now,
        blocked_until,
        block_count_24h: priorBlockCount + 1,
        last_blocked_at: now,
      });
    }
  },
});

// Runs every 5 minutes via cron to auto-unblock vendors whose cooldown has passed.
export const processAutoUnblocks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const blockedVendors = await ctx.db
      .query("vendor_registry")
      .filter((q) => q.eq(q.field("is_blocked"), true))
      .collect();

    for (const vendor of blockedVendors) {
      if (vendor.blocked_until && vendor.blocked_until <= now) {
        await ctx.db.patch(vendor._id, {
          is_blocked: false,
          blocked_reason: undefined,
          blocked_until: undefined,
        });
      }
    }
  },
});
