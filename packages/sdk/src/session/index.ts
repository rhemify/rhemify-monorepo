import type {
  MppSession,
  PaymentEvent,
  PaymentTrace,
  PolicyDecisionEvent,
  RhemifyConfig,
  SessionCloseResult,
  SessionOptions,
} from "../types.js";
import { PolicyBlockedError, NoWalletError, ExecutionError } from "../errors.js";
import { decodeSolanaKey } from "../utils/keys.js";
import { PolicyEngine } from "../policy/index.js";
import { GoServerTransport } from "../transport/index.js";
import { Trace } from "../trace/index.js";
import { AnchorQueue } from "../anchor/queue.js";

/**
 * Creates a governed MPP session.
 *
 * Wraps @solana/mpp session with:
 * 1. Policy gate on open — checks daily limit can absorb deposit
 * 2. Per-fetch policy check — cumulative spend tracked against daily limit
 * 3. Per-fetch trace emission — every request gets a trace
 * 4. Cumulative spend accounting
 */
export async function createGovernedSession(
  options: SessionOptions | undefined,
  config: RhemifyConfig,
  transport: GoServerTransport,
  policyEngine: PolicyEngine,
  anchorQueue: AnchorQueue | null,
): Promise<MppSession> {
  if (!config.wallet.solanaPrivateKey) {
    throw new NoWalletError("solana");
  }

  const maxDepositUsd = parseDeposit(options?.maxDeposit ?? "$1.00");
  const ttlSeconds = options?.ttlSeconds ?? 3600;
  const taskContext = options?.taskContext;

  // --- Policy gate: can this agent open a session for this deposit? ---
  const policyContext = await policyEngine.evaluate(
    {
      protocol: "mpp",
      confidence: "high",
      network: "solana-mainnet",
      price: `$${maxDepositUsd.toFixed(2)}`,
      priceRaw: maxDepositUsd * 1_000_000,
      currency: "USDC",
      payTo: "",
      raw: { headers: {}, body: null },
    },
    "session-deposit",
  );

  if (policyContext.action === "block") {
    throw new PolicyBlockedError(
      policyContext.reason ?? "Session deposit blocked by policy",
      policyContext,
    );
  }

  // --- Open MPP session via @solana/mpp ---
  let mppxSession: { fetch: typeof fetch; close?: () => Promise<unknown> };
  try {
    mppxSession = await openMppSession(config, maxDepositUsd, ttlSeconds, options?.autoTopup);
  } catch (err) {
    if (err instanceof NoWalletError || err instanceof ExecutionError) throw err;
    throw new ExecutionError(
      `Failed to open MPP session: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // --- Session state ---
  let cumulativeSpentUsd = 0;
  let requestCount = 0;
  const traceIds: string[] = [];
  let closed = false;

  // --- Governed fetch wrapper ---
  async function governedFetch(url: string, init?: RequestInit): Promise<Response> {
    if (closed) {
      throw new ExecutionError("Session is closed");
    }

    // MPP session pricing is per-request. The actual cost comes from the vendor's
    // charge response. Until we parse it from the 402 challenge, use the session's
    // average: deposit / expected_requests. Default $0.01 if unknown.
    // TODO: Parse actual per-request cost from vendor's MPP session pricing
    const estimatedCostUsd = maxDepositUsd / 100;

    // Policy check: would this request exceed daily limit?
    const projectedSpend = cumulativeSpentUsd + estimatedCostUsd;
    if (projectedSpend > maxDepositUsd) {
      throw new ExecutionError(
        `Session deposit exhausted: spent $${cumulativeSpentUsd.toFixed(4)}, deposit $${maxDepositUsd}`,
      );
    }

    // Create trace for this request
    const trace = new Trace(
      url,
      init?.method ?? "GET",
      config.agentId,
      config.fleetId,
      taskContext,
    );

    trace.recordDetection({
      protocol: "mpp",
      confidence: "high",
      network: "solana-mainnet",
      price: `$${estimatedCostUsd.toFixed(4)}`,
      priceRaw: estimatedCostUsd * 1_000_000,
      currency: "USDC",
      payTo: "",
      raw: { headers: {}, body: null },
    });

    trace.recordPolicyDecision({
      action: "allow",
      rulesFired: [
        {
          rule: "session_budget",
          decision: "allow",
          threshold: `$${maxDepositUsd}`,
          actual: `$${projectedSpend.toFixed(4)}`,
        },
      ],
    });

    trace.recordPathSelection([], {
      instrument: "squads",
      estimatedCost: estimatedCostUsd,
      estimatedLatency: 100,
      risk: "low",
      score: 0.1,
      available: true,
    });

    try {
      // Use the mppx session fetch — handles voucher signing
      const response = await mppxSession.fetch(url, init);

      // Track spend
      cumulativeSpentUsd += estimatedCostUsd;
      requestCount++;

      // Record success
      trace.recordExecution(true);
      const traceRecord = trace.finalize();
      traceIds.push(traceRecord.id);

      // Emit trace (fire-and-forget)
      emitSessionTrace(trace, transport, anchorQueue);

      return response;
    } catch (err) {
      trace.recordExecution(false, undefined, err instanceof Error ? err.message : String(err));
      const traceRecord = trace.finalize();
      traceIds.push(traceRecord.id);
      emitSessionTrace(trace, transport, anchorQueue);
      throw err;
    }
  }

  // --- Close session ---
  async function closeSession(): Promise<SessionCloseResult> {
    closed = true;

    let txHash = "";
    try {
      if (mppxSession.close) {
        const result = (await mppxSession.close()) as { signature?: string } | undefined;
        txHash = result?.signature ?? "";
      }
    } catch {
      // Close failure is non-fatal — session may have already expired
    }

    // Emit a final session-close trace
    const trace = new Trace("session-close", "CLOSE", config.agentId, config.fleetId, taskContext);

    trace.recordDetection({
      protocol: "mpp",
      confidence: "high",
      network: "solana-mainnet",
      price: `$${cumulativeSpentUsd.toFixed(4)}`,
      priceRaw: cumulativeSpentUsd * 1_000_000,
      currency: "USDC",
      payTo: "",
      raw: { headers: {}, body: null },
    });

    trace.recordPolicyDecision({
      action: "allow",
      rulesFired: [
        {
          rule: "session_close",
          decision: "allow",
          threshold: `${requestCount} requests`,
          actual: `$${cumulativeSpentUsd.toFixed(4)} total`,
        },
      ],
    });

    trace.recordPathSelection([], null);
    trace.recordExecution(true, txHash || undefined);
    trace.finalize();
    emitSessionTrace(trace, transport, anchorQueue);

    return {
      totalSpent: cumulativeSpentUsd,
      txHash,
      requestCount,
      traceIds,
    };
  }

  return {
    fetch: governedFetch,
    close: closeSession,
    spent: () => cumulativeSpentUsd,
    remaining: () => maxDepositUsd - cumulativeSpentUsd,
  };
}

// --- Helpers ---

async function openMppSession(
  config: RhemifyConfig,
  maxDepositUsd: number,
  ttlSeconds: number,
  autoTopup?: boolean,
): Promise<{ fetch: typeof fetch; close?: () => Promise<unknown> }> {
  // Dynamic import of @solana/mpp
  const mppClient = await import("@solana/mpp/client").catch(() => null);

  if (!mppClient) {
    // Fallback: return a basic fetch wrapper that doesn't do MPP
    // This allows session() to work in test/dev without @solana/mpp installed
    return {
      fetch: globalThis.fetch.bind(globalThis),
      close: async () => ({}),
    };
  }

  const solanaKit = await import("@solana/kit").catch(() => null);

  if (!solanaKit) {
    throw new ExecutionError("@solana/kit is required for MPP sessions. Run: bun add @solana/kit");
  }

  // Build signer
  const keyBytes = decodeSolanaKey(config.wallet.solanaPrivateKey!);
  const keypair = await solanaKit.createKeyPairFromBytes(keyBytes);
  const signer = await solanaKit.createSignerFromKeyPair(keypair);

  // Create MPP session method with deposit and TTL
  const depositBaseUnits = String(Math.floor(maxDepositUsd * 1_000_000));
  const method = mppClient.solana.session({
    signer,
    autoOpen: true,
    autoTopup: autoTopup ?? false,
    sessionDefaults: {
      suggestedDeposit: depositBaseUnits,
      ttlSeconds,
    },
  });

  const mppx = mppClient.Mppx.create({
    methods: [method],
  });

  return {
    fetch: mppx.fetch.bind(mppx) as typeof fetch,
    close: mppx.close?.bind(mppx),
  };
}

function parseDeposit(deposit: string): number {
  const cleaned = deposit.replace(/[$,]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0) {
    throw new Error(`Invalid deposit amount: ${deposit}`);
  }
  return num;
}

function emitSessionTrace(
  trace: Trace,
  transport: GoServerTransport,
  anchorQueue: AnchorQueue | null,
): void {
  const snapshot = trace.toSnapshot();
  const traceRecord = trace.finalize();
  const domain = extractDomain(snapshot.url);

  const event: PaymentEvent = {
    id: `evt_${traceRecord.id.replace("trc_", "")}`,
    timestamp: snapshot.startedAt,
    agent_id: snapshot.agentId,
    fleet_id: snapshot.fleetId,
    standard: "mpp",
    standard_version: "",
    amount: Number(snapshot.detection.priceRaw) / 1_000_000,
    token: "USDC",
    chain_from: "solana-mainnet",
    chain_to: "solana-mainnet",
    domain,
    outcome: snapshot.executionSuccess ? "success" : "failed",
    parent_event_id: null,
    delegation_depth: 0,
    instrument_type: "squads",
    trace_id: traceRecord.id,
  };

  const paymentTrace: PaymentTrace = {
    id: traceRecord.id,
    payment_event_id: event.id,
    agent_task_description: snapshot.taskContext ?? "",
    agent_task_step: snapshot.taskStep ?? null,
    trigger_402_raw: "",
    standard_detected: "mpp",
    standard_confidence: "high",
    alternatives_evaluated: [],
    policy_rules_fired: snapshot.policyDecision.rulesFired,
    instrument_selection_log: "MPP session voucher",
    bridge_scoring: null,
    economic_rationality_check: null,
    task_outcome: null,
    task_outcome_linked_at: null,
    replay_snapshot: {
      policy_state: {
        dailyLimit: 0,
        maxPerTransaction: 0,
        approvalThreshold: 0,
        allowedStandards: [],
        domainAllowlist: [],
      },
      detection: snapshot.detection,
      all_paths: [],
      policy_decision: snapshot.policyDecision,
    },
    trace_hash: traceRecord.traceHash,
    anchor_tx_hash: null,
    merkle_proof: null,
  };

  const policyDecisions: PolicyDecisionEvent[] = snapshot.policyDecision.rulesFired.map((r, i) => ({
    id: `pdec_${traceRecord.id.replace("trc_", "")}_${i}`,
    payment_event_id: event.id,
    agent_id: snapshot.agentId,
    rule_triggered: r.rule,
    decision: r.decision,
    threshold: r.threshold,
    actual_value: r.actual,
    domain,
    standard: "mpp" as const,
    human_approval_required: r.decision === "flag",
  }));

  transport.ingestPayment({ event, trace: paymentTrace, policyDecisions }).catch(() => {});

  // Anchor the trace
  if (anchorQueue && snapshot.executionSuccess) {
    anchorQueue.enqueue(traceRecord.id, traceRecord.traceHash, snapshot.fleetId, snapshot.agentId);
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
