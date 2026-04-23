import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRhemify } from "../src/index.js";
import { PolicyBlockedError, BudgetExceededError, NoWalletError } from "../src/errors.js";

/**
 * Integration test for the full pay() pipeline.
 * Mocks:
 *   - fetch() for the 402 endpoint (detection)
 *   - fetch() for Go server calls (policy + ingest)
 */

// Track all fetch calls
let fetchCalls: { url: string; method: string; body?: unknown }[] = [];

// Mock responses
const x402Response = {
  accepts: [
    {
      scheme: "exact",
      network: "solana-mainnet",
      maxAmountRequired: "500000", // $0.50 USDC
      payTo: "SolanaRecipient111",
      extra: { name: "USDC" },
    },
  ],
};

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
    dailyLimit: 0.1, // Only $0.10 daily limit
    maxPerTransaction: 50,
    approvalThreshold: 0,
    allowedStandards: ["mpp"], // Only MPP allowed
    domainAllowlist: ["allowed.com"],
  },
  spentToday: 0,
  blockedDomains: ["blocked-vendor.com"],
};

const ingestResponse = { eventId: "evt_test", traceId: "trc_test" };

function mockFetch(policyResp = policyResponse) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    let body: unknown;
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    fetchCalls.push({ url, method, body });

    // 402 endpoint
    if (url === "https://api.example.com/paid") {
      return new Response(JSON.stringify(x402Response), {
        status: 402,
        headers: { "content-type": "application/json" },
      });
    }

    // Go server: get policy
    if (url.includes("/api/policy/")) {
      return new Response(JSON.stringify(policyResp), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Go server: ingest
    if (url.includes("/api/ingest/payment")) {
      return new Response(JSON.stringify(ingestResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Go server: fleet status
    if (url.includes("/api/fleet/status")) {
      return new Response(
        JSON.stringify({
          agentId: "agent-1",
          spentToday: 10,
          dailyLimit: 100,
          activeAgents: 3,
          blockedDomains: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response("Not found", { status: 404 });
  });
}

function makeRhemify(overrides?: Record<string, unknown>) {
  return createRhemify({
    serverUrl: "http://localhost:8080",
    fleetApiKey: "test-fleet-key",
    agentId: "agent-1",
    fleetId: "fleet-1",
    wallet: { solanaPrivateKey: "fake-solana-key" },
    ...overrides,
  });
}

describe("pay() pipeline integration", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("runs detect → policy → resolve → dryRun and returns PayResult", async () => {
    globalThis.fetch = mockFetch();
    const rhemify = makeRhemify();

    const result = await rhemify.pay("https://api.example.com/paid", {
      dryRun: true,
      taskContext: "Testing the pipeline",
      taskStep: 1,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
    expect(result.detection.protocol).toBe("x402");
    expect(result.detection.network).toBe("solana-mainnet");
    expect(result.trace.id).toMatch(/^trc_/);
    expect(result.trace.traceHash).toHaveLength(64); // SHA-256 hex
    expect(result.trace.protocol).toBe("x402");
    expect(result.trace.policyRulesFired.length).toBeGreaterThan(0);
    expect(result.trace.alternativesEvaluated.length).toBeGreaterThan(0);
    expect(result.trace.chosenPath.instrument).toBe("ows");
    expect(result.trace.chosenPath.available).toBe(true);
  });

  it("emits trace to Go server on dryRun", async () => {
    globalThis.fetch = mockFetch();
    const rhemify = makeRhemify();

    await rhemify.pay("https://api.example.com/paid", { dryRun: true });

    // Wait a tick for the async emit
    await new Promise((r) => setTimeout(r, 10));

    const ingestCall = fetchCalls.find((c) => c.url.includes("/api/ingest"));
    expect(ingestCall).toBeDefined();
    expect(ingestCall!.method).toBe("POST");

    const payload = ingestCall!.body as Record<string, unknown>;
    expect(payload).toHaveProperty("event");
    expect(payload).toHaveProperty("trace");
    expect(payload).toHaveProperty("policyDecisions");
  });

  it("throws PolicyBlockedError when policy blocks", async () => {
    globalThis.fetch = mockFetch(tightPolicyResponse);
    const rhemify = makeRhemify();

    // x402 is not in allowedStandards (only mpp allowed)
    await expect(rhemify.pay("https://api.example.com/paid", { dryRun: true })).rejects.toThrow(
      PolicyBlockedError,
    );
  });

  it("throws BudgetExceededError when price exceeds budget", async () => {
    globalThis.fetch = mockFetch();
    const rhemify = makeRhemify();

    // $0.50 price > $0.10 budget
    await expect(
      rhemify.pay("https://api.example.com/paid", { maxBudget: "$0.10" }),
    ).rejects.toThrow(BudgetExceededError);
  });

  it("throws NoWalletError when no wallet matches", async () => {
    globalThis.fetch = mockFetch();
    const rhemify = makeRhemify({ wallet: {} }); // No wallet keys

    await expect(rhemify.pay("https://api.example.com/paid", { dryRun: true })).rejects.toThrow(
      NoWalletError,
    );
  });

  it("still emits trace on policy block", async () => {
    globalThis.fetch = mockFetch(tightPolicyResponse);
    const rhemify = makeRhemify();

    try {
      await rhemify.pay("https://api.example.com/paid", { dryRun: true });
    } catch {
      // expected
    }

    await new Promise((r) => setTimeout(r, 10));

    const ingestCall = fetchCalls.find((c) => c.url.includes("/api/ingest"));
    expect(ingestCall).toBeDefined();

    const payload = ingestCall!.body as Record<string, Record<string, unknown>>;
    expect(payload.event.outcome).toBe("rejected");
  });

  it("sends Authorization header to Go server", async () => {
    const fetchMock = mockFetch();
    globalThis.fetch = fetchMock;
    const rhemify = makeRhemify();

    await rhemify.pay("https://api.example.com/paid", { dryRun: true });

    // Find a Go server call (policy fetch)
    const policyCallIndex = fetchCalls.findIndex((c) => c.url.includes("/api/policy/"));
    expect(policyCallIndex).toBeGreaterThanOrEqual(0);

    // Check the raw fetch mock call for headers
    const rawCall = fetchMock.mock.calls[policyCallIndex];
    const init = rawCall?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers?.Authorization).toBe("Bearer test-fleet-key");
  });
});

describe("probe() integration", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns canPay=true for allowed payment", async () => {
    globalThis.fetch = mockFetch();
    const rhemify = makeRhemify();

    const result = await rhemify.probe("https://api.example.com/paid");

    expect(result.canPay).toBe(true);
    expect(result.detection.protocol).toBe("x402");
    expect(result.policyDecision.action).toBe("allow");
    expect(result.estimatedPaths.length).toBeGreaterThan(0);
    expect(result.estimatedCost).toMatch(/^\$/);
  });

  it("returns canPay=false when policy blocks", async () => {
    globalThis.fetch = mockFetch(tightPolicyResponse);
    const rhemify = makeRhemify();

    const result = await rhemify.probe("https://api.example.com/paid");

    expect(result.canPay).toBe(false);
    expect(result.policyDecision.action).toBe("block");
  });

  it("returns canPay=false when no wallet available", async () => {
    globalThis.fetch = mockFetch();
    const rhemify = makeRhemify({ wallet: {} });

    const result = await rhemify.probe("https://api.example.com/paid");

    expect(result.canPay).toBe(false);
    expect(result.estimatedCost).toBe("N/A");
  });
});
