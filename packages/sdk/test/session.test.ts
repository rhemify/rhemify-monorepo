import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRhemos } from "../src/index.js";
import { PolicyBlockedError, ExecutionError } from "../src/errors.js";

// Track fetch calls
let fetchCalls: { url: string; method: string; body?: unknown }[] = [];

const policyResponse = {
  policy: {
    dailyLimit: 100,
    maxPerTransaction: 50,
    approvalThreshold: 0,
    allowedStandards: [],
    domainAllowlist: [],
  },
  spentToday: 10,
  blockedDomains: [],
};

const tightPolicyResponse = {
  policy: {
    dailyLimit: 0.50,
    maxPerTransaction: 0.10,
    approvalThreshold: 0,
    allowedStandards: ["x402"], // MPP not allowed
    domainAllowlist: [],
  },
  spentToday: 0,
  blockedDomains: [],
};

function mockFetch(policyResp = policyResponse) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    fetchCalls.push({ url, method });

    // Go server: policy
    if (url.includes("/api/policy/")) {
      return new Response(JSON.stringify(policyResp), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Go server: ingest
    if (url.includes("/api/ingest/payment")) {
      return new Response(JSON.stringify({ eventId: "evt_1", traceId: "trc_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // MPP vendor endpoint (simulated — session.fetch hits this)
    if (url.includes("api.vendor.com")) {
      return new Response(JSON.stringify({ data: "paid content", price: 0.01 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  });
}

function makeRhemos(overrides?: Record<string, unknown>) {
  return createRhemos({
    serverUrl: "http://localhost:8080",
    fleetApiKey: "test-fleet-key",
    agentId: "agent-1",
    fleetId: "fleet-1",
    wallet: { solanaPrivateKey: "fake-solana-key" },
    ...overrides,
  });
}

describe("session() governance wrapper", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("opens a session and returns MppSession interface", async () => {
    globalThis.fetch = mockFetch();
    const rhemos = makeRhemos();

    const session = await rhemos.session({
      maxDeposit: "$5.00",
      taskContext: "Test session",
    });

    expect(session).toHaveProperty("fetch");
    expect(session).toHaveProperty("close");
    expect(session).toHaveProperty("spent");
    expect(session).toHaveProperty("remaining");
    expect(typeof session.fetch).toBe("function");
    expect(typeof session.close).toBe("function");
    expect(session.spent()).toBe(0);
    expect(session.remaining()).toBe(5);
  });

  it("tracks cumulative spend across fetch calls", async () => {
    globalThis.fetch = mockFetch();
    const rhemos = makeRhemos();
    const session = await rhemos.session({ maxDeposit: "$1.00" });

    await session.fetch("https://api.vendor.com/data");
    expect(session.spent()).toBeGreaterThan(0);
    expect(session.remaining()).toBeLessThan(1);

    const spentAfterFirst = session.spent();

    await session.fetch("https://api.vendor.com/data2");
    expect(session.spent()).toBeGreaterThan(spentAfterFirst);
  });

  it("emits a trace for each fetch call", async () => {
    globalThis.fetch = mockFetch();
    const rhemos = makeRhemos();
    const session = await rhemos.session({ maxDeposit: "$1.00" });

    await session.fetch("https://api.vendor.com/data");

    // Wait for async emit
    await new Promise((r) => setTimeout(r, 20));

    const ingestCalls = fetchCalls.filter((c) => c.url.includes("/api/ingest"));
    expect(ingestCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("close() returns session summary with traceIds", async () => {
    globalThis.fetch = mockFetch();
    const rhemos = makeRhemos();
    const session = await rhemos.session({ maxDeposit: "$1.00" });

    await session.fetch("https://api.vendor.com/data");
    await session.fetch("https://api.vendor.com/data2");

    const result = await session.close();

    expect(result.requestCount).toBe(2);
    expect(result.totalSpent).toBeGreaterThan(0);
    expect(result.traceIds).toHaveLength(2);
    expect(result.traceIds[0]).toMatch(/^trc_/);
  });

  it("fetch throws after session is closed", async () => {
    globalThis.fetch = mockFetch();
    const rhemos = makeRhemos();
    const session = await rhemos.session({ maxDeposit: "$1.00" });

    await session.close();

    await expect(
      session.fetch("https://api.vendor.com/data"),
    ).rejects.toThrow("closed");
  });

  it("throws PolicyBlockedError when policy blocks the session deposit", async () => {
    globalThis.fetch = mockFetch(tightPolicyResponse);
    const rhemos = makeRhemos();

    // MPP not in allowedStandards (only x402 allowed)
    await expect(
      rhemos.session({ maxDeposit: "$5.00" }),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it("throws when deposit exceeds remaining daily limit", async () => {
    const nearLimitPolicy = {
      policy: {
        dailyLimit: 2,
        maxPerTransaction: 50,
        approvalThreshold: 0,
        allowedStandards: [],
        domainAllowlist: [],
      },
      spentToday: 1.50,
      blockedDomains: [],
    };

    globalThis.fetch = mockFetch(nearLimitPolicy);
    const rhemos = makeRhemos();

    // $5 deposit but only $0.50 remaining in daily limit
    await expect(
      rhemos.session({ maxDeposit: "$5.00" }),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it("throws on invalid deposit amount", async () => {
    globalThis.fetch = mockFetch();
    const rhemos = makeRhemos();

    await expect(
      rhemos.session({ maxDeposit: "not-a-number" }),
    ).rejects.toThrow("Invalid deposit");
  });

  it("close emits a session-close trace", async () => {
    globalThis.fetch = mockFetch();
    const rhemos = makeRhemos();
    const session = await rhemos.session({ maxDeposit: "$1.00" });

    await session.fetch("https://api.vendor.com/data");
    await session.close();

    // Wait for async emits
    await new Promise((r) => setTimeout(r, 20));

    // Should have at least 2 ingest calls: one for the fetch, one for the close
    const ingestCalls = fetchCalls.filter((c) => c.url.includes("/api/ingest"));
    expect(ingestCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("spent and remaining update correctly", async () => {
    globalThis.fetch = mockFetch();
    const rhemos = makeRhemos();
    const session = await rhemos.session({ maxDeposit: "$1.00" });

    expect(session.spent()).toBe(0);
    expect(session.remaining()).toBe(1);

    await session.fetch("https://api.vendor.com/data");

    expect(session.spent() + session.remaining()).toBeCloseTo(1, 2);
  });
});
