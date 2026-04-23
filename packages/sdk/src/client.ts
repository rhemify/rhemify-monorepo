import type {
  FleetStatus,
  MppSession,
  PayOptions,
  PaymentEvent,
  PaymentTrace,
  PayResult,
  PipelineStage,
  PolicyConfig,
  PolicyDecisionEvent,
  ProbeOptions,
  ProbeResult,
  Rhemify,
  RhemifyConfig,
  SessionOptions,
} from "./types.js";
import {
  BudgetExceededError,
  DetectionError,
  NoWalletError,
  PolicyBlockedError,
} from "./errors.js";
import { GoServerTransport } from "./transport/index.js";
import { detectProtocol } from "./detect/index.js";
import { PolicyEngine } from "./policy/index.js";
import { PathResolver } from "./resolve/index.js";
import { executeWithCascade } from "./execute/index.js";
import { Trace } from "./trace/index.js";
import { AnchorQueue } from "./anchor/queue.js";
import { createGovernedSession } from "./session/index.js";
import { discover as discoverServices } from "./discovery/index.js";
import type { DiscoverOptions } from "./types.js";

export function createRhemify(config: RhemifyConfig): Rhemify {
  const transport = new GoServerTransport(config.serverUrl, config.fleetApiKey);
  const policyEngine = new PolicyEngine(transport, config.agentId, config.policyCacheTtl ?? 30_000);
  const pathResolver = new PathResolver();

  // Layer 1: Memo anchoring queue (enabled if Solana wallet + RPC available)
  const anchorEnabled =
    config.anchor?.enabled !== false &&
    !!config.wallet.solanaPrivateKey &&
    !!(config.anchor?.rpcUrl ?? config.solanaRpcUrl);

  const anchorQueue = anchorEnabled
    ? new AnchorQueue({
        solanaPrivateKey: config.wallet.solanaPrivateKey!,
        rpcUrl: config.anchor?.rpcUrl ?? config.solanaRpcUrl!,
        transport,
        onAnchored: config.anchor?.onAnchored,
        onError: config.anchor?.onError,
        maxRetries: config.anchor?.maxRetries,
        flushIntervalMs: config.anchor?.flushIntervalMs,
      })
    : null;

  function emitTrace(trace: Trace): void {
    const snapshot = trace.toSnapshot();
    const traceRecord = trace.finalize();
    const domain = extractDomain(snapshot.url);

    const event: PaymentEvent = {
      id: `evt_${traceRecord.id.replace("trc_", "")}`,
      timestamp: snapshot.startedAt,
      agent_id: snapshot.agentId,
      fleet_id: snapshot.fleetId,
      standard: snapshot.detection.protocol,
      standard_version: "",
      amount: Number(snapshot.detection.priceRaw) / 1_000_000,
      token: snapshot.detection.currency,
      chain_from: snapshot.detection.network,
      chain_to: snapshot.detection.network,
      domain,
      outcome: snapshot.executionSuccess
        ? "success"
        : snapshot.policyDecision.action === "block"
          ? "rejected"
          : "failed",
      parent_event_id: null,
      delegation_depth: 0,
      instrument_type: snapshot.chosenPath?.instrument ?? "none",
      trace_id: traceRecord.id,
    };

    const paymentTrace: PaymentTrace = {
      id: traceRecord.id,
      payment_event_id: event.id,
      agent_task_description: snapshot.taskContext ?? "",
      agent_task_step: snapshot.taskStep ?? null,
      trigger_402_raw: JSON.stringify(snapshot.detection.raw),
      standard_detected: snapshot.detection.protocol,
      standard_confidence: snapshot.detection.confidence,
      alternatives_evaluated: snapshot.allPaths,
      policy_rules_fired: snapshot.policyDecision.rulesFired,
      instrument_selection_log: snapshot.chosenPath
        ? `${snapshot.chosenPath.instrument} selected: score ${snapshot.chosenPath.score}`
        : "No path available",
      bridge_scoring: null,
      economic_rationality_check: null,
      task_outcome: null,
      task_outcome_linked_at: null,
      replay_snapshot: {
        policy_state:
          snapshot.policyDecision.rulesFired.length > 0
            ? {
                dailyLimit: 0,
                maxPerTransaction: 0,
                approvalThreshold: 0,
                allowedStandards: [],
                domainAllowlist: [],
              }
            : {
                dailyLimit: 0,
                maxPerTransaction: 0,
                approvalThreshold: 0,
                allowedStandards: [],
                domainAllowlist: [],
              },
        detection: snapshot.detection,
        all_paths: snapshot.allPaths,
        policy_decision: snapshot.policyDecision,
      },
      trace_hash: traceRecord.traceHash,
      anchor_tx_hash: null,
      merkle_proof: null,
    };

    const policyDecisions: PolicyDecisionEvent[] = snapshot.policyDecision.rulesFired.map(
      (r, i) => ({
        id: `pdec_${traceRecord.id.replace("trc_", "")}_${i}`,
        payment_event_id: event.id,
        agent_id: snapshot.agentId,
        rule_triggered: r.rule,
        decision: r.decision,
        threshold: r.threshold,
        actual_value: r.actual,
        domain,
        standard: snapshot.detection.protocol,
        human_approval_required: r.decision === "flag",
      }),
    );

    transport.ingestPayment({ event, trace: paymentTrace, policyDecisions }).catch((err) => {
      config.onError?.(err instanceof Error ? err : new Error(String(err)));
    });

    // Layer 1: Enqueue Memo anchoring (async, non-blocking)
    if (anchorQueue && snapshot.executionSuccess) {
      anchorQueue.enqueue(
        traceRecord.id,
        traceRecord.traceHash,
        snapshot.fleetId,
        snapshot.agentId,
      );
    }
  }

  function emitStage(stage: PipelineStage, data: Record<string, unknown>): void {
    try {
      config.onStageComplete?.({ stage, timestamp: Date.now(), data });
    } catch {
      // Never let callback errors break the pipeline
    }
  }

  async function pay<T = unknown>(url: string, options?: PayOptions): Promise<PayResult<T>> {
    const method = options?.method ?? "GET";
    const trace = new Trace(
      url,
      method,
      config.agentId,
      config.fleetId,
      options?.taskContext,
      options?.taskStep,
    );

    // --- Stage 1: DETECT + DISCOVER (parallel, discovery is best-effort) ---
    const [detection, alternatives] = await Promise.all([
      detectProtocol(url, {
        method,
        headers: options?.headers,
        timeout: config.timeout,
      }),
      discoverServices(extractDomain(url), {
        limit: 5,
        timeoutMs: Math.min(config.timeout ?? 5000, 4000),
      }).catch(() => [] as import("./discovery/index.js").ServiceCandidate[]),
    ]);
    trace.recordDetection(detection);
    emitStage("detect", {
      protocol: detection.protocol,
      confidence: detection.confidence,
      network: detection.network,
    });

    if (detection.protocol === "unknown") {
      throw new DetectionError(`No payment protocol detected at ${url}`, url);
    }

    // --- Client-side budget check (safety net before policy) ---
    const budget = parseBudget(options?.maxBudget ?? config.defaultMaxBudget);
    if (budget !== null) {
      const price = Number(detection.priceRaw) / 1_000_000;
      if (price > budget) {
        throw new BudgetExceededError(price, budget);
      }
    }

    // --- Stage 2: POLICY ---
    const domain = extractDomain(url);
    const policyDecision = await policyEngine.evaluate(detection, domain);
    trace.recordPolicyDecision(policyDecision);
    emitStage("policy", {
      action: policyDecision.action,
      reason: policyDecision.reason ?? null,
      rulesCount: policyDecision.rulesFired.length,
    });

    if (policyDecision.action === "block") {
      trace.recordExecution(false, undefined, policyDecision.reason);
      emitTrace(trace);

      throw new PolicyBlockedError(
        policyDecision.reason ?? "Payment blocked by policy",
        policyDecision,
      );
    }

    // --- Stage 3: RESOLVE ---
    const allPaths = pathResolver.resolve(detection, config.wallet);
    const chosenPath = allPaths.find((p) => p.available) ?? null;
    trace.recordPathSelection(allPaths, chosenPath);
    emitStage("resolve", {
      pathsEvaluated: allPaths.length,
      chosen: chosenPath?.instrument ?? null,
      estimatedCost: chosenPath?.estimatedCost ?? null,
    });

    if (!chosenPath) {
      trace.recordExecution(false, undefined, "No available payment path");
      emitTrace(trace);

      throw new NoWalletError(detection.network);
    }

    // --- Stage 4: EXECUTE ---
    if (options?.dryRun) {
      trace.recordExecution(true);
      const traceRecord = trace.finalize();
      emitTrace(trace);

      return {
        success: true,
        data: null,
        trace: traceRecord,
        detection,
        receipt: {},
        alternatives,
      } as PayResult<T>;
    }

    // Real execution with cascade fallback
    try {
      const execResult = await executeWithCascade(url, detection, config.wallet, options ?? {});

      emitStage("execute", { success: true, txHash: execResult.txHash ?? null });

      // --- Stage 5: TRACE ---
      trace.recordExecution(true, execResult.txHash);
      const traceRecord = trace.finalize();
      emitStage("trace", { traceId: traceRecord.id, traceHash: traceRecord.traceHash });

      // --- Stage 6: EMIT ---
      emitTrace(trace);
      emitStage("anchor", { traceId: traceRecord.id, anchorEnabled: !!anchorQueue });

      // Notify callback
      const result: PayResult<T> = {
        success: true,
        data: execResult.data as T,
        trace: traceRecord,
        detection,
        receipt: {
          txHash: execResult.txHash,
          protocolReceipt: execResult.protocolReceipt,
        },
        alternatives,
      };

      await config.onPayment?.(result as PayResult);
      return result;
    } catch (err) {
      trace.recordExecution(false, undefined, err instanceof Error ? err.message : String(err));
      emitTrace(trace);
      throw err;
    }
  }

  async function probe(url: string, options?: ProbeOptions): Promise<ProbeResult> {
    const detection = await detectProtocol(url, {
      method: options?.method,
      headers: options?.headers,
      timeout: config.timeout,
    });

    const domain = extractDomain(url);
    const policyDecision = await policyEngine.evaluate(detection, domain);
    const allPaths = pathResolver.resolve(detection, config.wallet);
    const best = allPaths.find((p) => p.available) ?? null;

    return {
      canPay: policyDecision.action !== "block" && best !== null,
      detection,
      policyDecision,
      estimatedPaths: allPaths,
      estimatedCost: best ? `$${best.estimatedCost.toFixed(4)}` : "N/A",
    };
  }

  async function session(sessionOptions?: SessionOptions): Promise<MppSession> {
    return createGovernedSession(sessionOptions, config, transport, policyEngine, anchorQueue);
  }

  async function setPolicy(policy: Partial<PolicyConfig>): Promise<void> {
    await transport.setPolicy(config.agentId, policy);
    policyEngine.invalidateCache();
  }

  async function status(): Promise<FleetStatus> {
    return transport.getFleetStatus();
  }

  function discover(intent: string, options?: DiscoverOptions) {
    return discoverServices(intent, options);
  }

  return { pay, probe, session, discover, setPolicy, status };
}

// --- Helpers ---

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function parseBudget(budget?: string): number | null {
  if (!budget) return null;
  const cleaned = budget.replace(/[$,]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}
