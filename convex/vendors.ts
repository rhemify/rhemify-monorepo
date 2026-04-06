import { query } from "./_generated/server";
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
      isBlocked: vendor.success_rate < 0.5,
      successRate: vendor.success_rate,
      avgLatencyMs: vendor.avg_latency_ms,
      uptimePct: vendor.uptime_pct,
      totalPayments: vendor.total_payments,
      supportedStandards: vendor.supported_standards,
    };
  },
});
