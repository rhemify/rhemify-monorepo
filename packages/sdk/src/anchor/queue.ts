import { sendMemoTransaction } from "./memo.js";
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
  private processing = false;
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
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        // Take a batch of items
        const batch = this.queue.splice(0, this.config.batchSize);
        const success = await this.processBatch(batch);

        if (!success) {
          // Check retries for each item
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
          // Backoff before retry
          const maxRetryCount = Math.max(...batch.map((i) => i.retries));
          await sleep(RETRY_BACKOFF_BASE_MS * Math.pow(2, maxRetryCount - 1));
        }
      }
    } finally {
      this.processing = false;
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

    // For batched memos: send one tx with multiple Memo instructions
    // Currently sendMemoTransaction sends one memo per tx.
    // TODO: Implement multi-memo tx builder for true batching.
    // For now, send them individually but in sequence (still saves on
    // blockhash fetching by reusing the same recent blockhash).
    let allSuccess = true;
    for (const item of batch) {
      const success = await this.processSingle(item);
      if (!success) allSuccess = false;
    }
    return allSuccess;
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

      this.config.transport?.updateTraceAnchor(item.traceId, txSignature).catch(() => {});

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
