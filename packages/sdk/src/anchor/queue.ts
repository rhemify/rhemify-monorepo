import { sendMemoTransaction, sendBatchMemoTransaction } from "./memo.js";
import type { MemoPayload } from "./memo.js";
import type { GoServerTransport } from "../transport/index.js";

export interface AnchorQueueConfig {
  solanaPrivateKey: string;
  rpcUrl: string;
  transport: GoServerTransport;
  onAnchored?: (traceId: string, txHash: string) => void;
  onError?: (traceId: string, error: Error) => void;
  maxRetries?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  batchSize?: number;
}

interface QueueItem {
  traceId: string;
  traceHash: string;
  fleetId: string;
  agentId: string;
  timestamp: number;
  retries: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_FLUSH_INTERVAL_MS = 2000;
const DEFAULT_MAX_QUEUE_SIZE = 1000;
const DEFAULT_BATCH_SIZE = 5;
const RETRY_BACKOFF_BASE_MS = 1000;

/**
 * Background queue for anchoring trace hashes as Solana Memo transactions.
 *
 * Batches up to `batchSize` memo instructions per Solana tx to reduce costs.
 * One tx with 5 memos costs the same fee (~$0.00075) as one tx with 1 memo.
 * This cuts anchoring cost by up to 5x.
 *
 * Processes serially to avoid blockhash conflicts. Items are enqueued from
 * emitTrace() and processed every flushIntervalMs.
 */
export class AnchorQueue {
  private queue: Array<QueueItem> = [];
  /**
   * Tracks the in-flight flush() promise so drain() can await it. Without
   * this, the 2s background timer can be mid-`processBatch` when the CLI
   * calls drain(); a naive "if processing return" guard would let drain bail
   * while items are still being processed off-thread, the CLI exits, and the
   * in-flight Solana RPC + Convex patch get aborted mid-await. Net effect:
   * pending=0 (item already spliced out), but the Memo tx never lands and
   * `payment_traces.anchor_tx_hash` stays null. Sharing the promise lets
   * re-entrant flush() calls join the existing work instead of racing it.
   */
  private inflight: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private config: Required<
    Pick<
      AnchorQueueConfig,
      | "solanaPrivateKey"
      | "rpcUrl"
      | "maxRetries"
      | "flushIntervalMs"
      | "maxQueueSize"
      | "batchSize"
    >
  > &
    Pick<AnchorQueueConfig, "transport" | "onAnchored" | "onError">;

  constructor(userConfig: AnchorQueueConfig) {
    this.config = {
      solanaPrivateKey: userConfig.solanaPrivateKey,
      rpcUrl: userConfig.rpcUrl,
      transport: userConfig.transport,
      onAnchored: userConfig.onAnchored,
      onError: userConfig.onError,
      maxRetries: userConfig.maxRetries ?? DEFAULT_MAX_RETRIES,
      flushIntervalMs: userConfig.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      maxQueueSize: userConfig.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
      batchSize: userConfig.batchSize ?? DEFAULT_BATCH_SIZE,
    };

    this.timer = setInterval(() => {
      this.flush().catch(() => {});
    }, this.config.flushIntervalMs);

    // Don't keep the process alive just for anchoring
    if (this.timer && typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  enqueue(traceId: string, traceHash: string, fleetId: string, agentId: string): void {
    if (this.stopped) return;

    if (this.queue.length >= this.config.maxQueueSize) {
      this.queue.shift();
    }

    this.queue.push({
      traceId,
      traceHash,
      fleetId,
      agentId,
      timestamp: Math.floor(Date.now() / 1000),
      retries: 0,
    });
  }

  async flush(): Promise<void> {
    // If a flush is already in-flight, await it instead of bailing — drain()
    // depends on this so it can guarantee all enqueued items have been
    // attempted (and persisted) before returning. Re-entrant callers (e.g.
    // the 2s background timer firing concurrently with drain) cooperate via
    // the same promise rather than racing.
    if (this.inflight) {
      await this.inflight;
      if (this.queue.length === 0) return;
    }
    if (this.queue.length === 0) return;

    const work = this.flushLoop();
    this.inflight = work;
    try {
      await work;
    } finally {
      if (this.inflight === work) this.inflight = null;
    }
  }

  private async flushLoop(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.config.batchSize);
      const success = await this.processBatch(batch);

      if (!success) {
        for (const item of batch) {
          if (item.retries >= this.config.maxRetries) {
            this.config.onError?.(
              item.traceId,
              new Error(`Memo anchoring failed after ${item.retries} retries`),
            );
          } else {
            item.retries++;
            this.queue.push(item);
          }
        }
        const maxRetryCount = Math.max(...batch.map((i) => i.retries));
        await sleep(RETRY_BACKOFF_BASE_MS * Math.pow(2, maxRetryCount - 1));
      }
    }
  }

  async drain(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  pending(): number {
    return this.queue.length;
  }

  private async processBatch(batch: Array<QueueItem>): Promise<boolean> {
    if (batch.length === 1) {
      return this.processSingle(batch[0]!);
    }

    // True multi-memo batching: all N payloads in one Solana tx.
    // N memos cost the same ~$0.00075 as a single memo tx.
    try {
      const payloads: MemoPayload[] = batch.map((item) => ({
        op: "rhemify-trace",
        id: item.traceId,
        hash: item.traceHash,
        fleet: item.fleetId,
        agent: item.agentId,
        ts: item.timestamp,
      }));

      const txSignature = await sendBatchMemoTransaction(
        payloads,
        this.config.solanaPrivateKey,
        this.config.rpcUrl,
      );

      // Awaited so drain() can guarantee the trace document's anchor_tx_hash
      // is patched in Convex before returning. Fire-and-forget lost the update
      // in short-lived processes (CLI exits before promise resolves).
      // Persistence failures are logged via onError but do not fail the batch:
      // the Memo tx itself succeeded and can be re-attached out-of-band.
      for (const item of batch) {
        if (this.config.transport) {
          try {
            await this.config.transport.updateTraceAnchor(item.traceId, txSignature);
          } catch (err) {
            this.config.onError?.(
              item.traceId,
              err instanceof Error ? err : new Error(String(err)),
            );
          }
        }
        this.config.onAnchored?.(item.traceId, txSignature);
      }
      return true;
    } catch {
      return false;
    }
  }

  private async processSingle(item: QueueItem): Promise<boolean> {
    try {
      const txSignature = await sendMemoTransaction({
        traceId: item.traceId,
        traceHash: item.traceHash,
        fleetId: item.fleetId,
        agentId: item.agentId,
        timestamp: item.timestamp,
        solanaPrivateKey: this.config.solanaPrivateKey,
        rpcUrl: this.config.rpcUrl,
      });

      // Awaited — see processBatch for the same rationale.
      if (this.config.transport) {
        try {
          await this.config.transport.updateTraceAnchor(item.traceId, txSignature);
        } catch (err) {
          this.config.onError?.(
            item.traceId,
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
      this.config.onAnchored?.(item.traceId, txSignature);
      return true;
    } catch {
      return false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
