import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildMemoPayload } from "../src/anchor/memo.js";
import { AnchorQueue } from "../src/anchor/queue.js";

describe("buildMemoPayload", () => {
  it("builds a valid memo payload", () => {
    const payload = buildMemoPayload(
      "trc_abc123",
      "sha256hexhash",
      "fleet-1",
      "agent-1",
      1712400000,
    );

    expect(payload.op).toBe("rhemify-trace");
    expect(payload.id).toBe("trc_abc123");
    expect(payload.hash).toBe("sha256hexhash");
    expect(payload.fleet).toBe("fleet-1");
    expect(payload.agent).toBe("agent-1");
    expect(payload.ts).toBe(1712400000);
  });

  it("serializes under 566 bytes", () => {
    const payload = buildMemoPayload(
      "trc_abcdef1234567890",
      "a".repeat(64), // SHA-256 hex = 64 chars
      "fleet-long-identifier-1234",
      "agent-long-identifier-5678",
      1712400000,
    );

    const serialized = JSON.stringify(payload);
    expect(serialized.length).toBeLessThan(566);
  });
});

describe("AnchorQueue", () => {
  // Mock sendMemoTransaction at the module level
  vi.mock("../src/anchor/memo.js", async (importOriginal) => {
    const original = await importOriginal<typeof import("../src/anchor/memo.js")>();
    return {
      ...original,
      sendMemoTransaction: vi.fn(async () => "mock_tx_signature_base58"),
    };
  });

  function mockTransport() {
    return {
      updateTraceAnchor: vi.fn(async () => {}),
      getPolicy: vi.fn(),
      setPolicy: vi.fn(),
      ingestPayment: vi.fn(),
      getFleetStatus: vi.fn(),
      getVendorStatus: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues items and reports pending count", () => {
    const transport = mockTransport();
    const queue = new AnchorQueue({
      solanaPrivateKey: "fake-key",
      rpcUrl: "https://api.devnet.solana.com",
      transport: transport as never,
      flushIntervalMs: 999999, // don't auto-flush
    });

    queue.enqueue("trc_1", "hash_1", "fleet-1", "agent-1");
    queue.enqueue("trc_2", "hash_2", "fleet-1", "agent-1");

    expect(queue.pending()).toBe(2);
  });

  it("processes items on flush", async () => {
    const anchored = vi.fn();
    const transport = mockTransport();

    const queue = new AnchorQueue({
      solanaPrivateKey: "fake-key",
      rpcUrl: "https://api.devnet.solana.com",
      transport: transport as never,
      onAnchored: anchored,
      flushIntervalMs: 999999,
    });

    queue.enqueue("trc_1", "hash_1", "fleet-1", "agent-1");
    await queue.flush();

    expect(queue.pending()).toBe(0);
    expect(anchored).toHaveBeenCalledWith("trc_1", "mock_tx_signature_base58");
    expect(transport.updateTraceAnchor).toHaveBeenCalledWith("trc_1", "mock_tx_signature_base58");
  });

  it("drops oldest when queue is full", () => {
    const transport = mockTransport();
    const queue = new AnchorQueue({
      solanaPrivateKey: "fake-key",
      rpcUrl: "https://api.devnet.solana.com",
      transport: transport as never,
      maxQueueSize: 3,
      flushIntervalMs: 999999,
    });

    queue.enqueue("trc_1", "hash_1", "fleet-1", "agent-1");
    queue.enqueue("trc_2", "hash_2", "fleet-1", "agent-1");
    queue.enqueue("trc_3", "hash_3", "fleet-1", "agent-1");
    queue.enqueue("trc_4", "hash_4", "fleet-1", "agent-1"); // should drop trc_1

    expect(queue.pending()).toBe(3);
  });

  it("stops accepting after drain", async () => {
    const transport = mockTransport();
    const queue = new AnchorQueue({
      solanaPrivateKey: "fake-key",
      rpcUrl: "https://api.devnet.solana.com",
      transport: transport as never,
      flushIntervalMs: 999999,
    });

    await queue.drain();
    queue.enqueue("trc_1", "hash_1", "fleet-1", "agent-1");
    expect(queue.pending()).toBe(0); // rejected after drain
  });

  it("is a no-op when flush is called on empty queue", async () => {
    const transport = mockTransport();
    const queue = new AnchorQueue({
      solanaPrivateKey: "fake-key",
      rpcUrl: "https://api.devnet.solana.com",
      transport: transport as never,
      flushIntervalMs: 999999,
    });

    await queue.flush(); // should not throw
    expect(queue.pending()).toBe(0);
  });

  // Regression test for commit 9b04d89 — the drain race fix.
  //
  // Failure mode (pre-fix): the 2s background timer fires while drain() is
  // also running; drain's flush() sees `processing=true` (or queue.length=0
  // because the timer already spliced the items out) and returns immediately.
  // The in-flight processBatch keeps running off-thread, but the CLI exits
  // before it completes — the Memo tx + updateTraceAnchor PATCH get torn
  // down mid-await. Convex's payment_traces.anchor_tx_hash stays null.
  //
  // The fix (queue.ts:54, 110-128) tracks the in-flight flush() in an
  // `inflight: Promise<void>` so re-entrant callers (drain, concurrent
  // timer tick) join the existing work instead of racing it.
  //
  // This test makes the race deterministic by holding updateTraceAnchor open
  // — drain() must not resolve until the PATCH lands.
  it("drain() waits for in-flight processBatch instead of returning prematurely", async () => {
    const transport = mockTransport();
    let releaseAnchor: () => void = () => {};
    const anchorBarrier = new Promise<void>((resolve) => {
      releaseAnchor = resolve;
    });
    // updateTraceAnchor stays pending until releaseAnchor() is called —
    // simulates a slow Convex region or a heavily-loaded ingest goroutine.
    transport.updateTraceAnchor = vi.fn(async () => {
      await anchorBarrier;
    });

    const queue = new AnchorQueue({
      solanaPrivateKey: "fake-key",
      rpcUrl: "https://api.devnet.solana.com",
      transport: transport as never,
      flushIntervalMs: 999999,
    });
    queue.enqueue("trc_race", "hash_race", "fleet-1", "agent-1");

    // Kick off a flush in the background — it will splice the item, send
    // the (mocked) Memo tx, then block awaiting updateTraceAnchor.
    const backgroundFlush = queue.flush();

    // Yield to the microtask queue so flush enters processSingle and
    // calls transport.updateTraceAnchor before drain() starts.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(transport.updateTraceAnchor).toHaveBeenCalledTimes(1);
    expect(queue.pending()).toBe(0); // item already spliced; would fool a naive drain

    // Drain should join the existing work, not bail.
    let drainResolved = false;
    const drainPromise = queue.drain().then(() => {
      drainResolved = true;
    });

    // After another tick, drain() must still be pending — the PATCH hasn't
    // resolved yet. If drain() resolved here, the race-fix regressed.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(drainResolved).toBe(false);

    // Release the PATCH; drain() must complete now.
    releaseAnchor();
    await Promise.all([backgroundFlush, drainPromise]);
    expect(drainResolved).toBe(true);
    expect(transport.updateTraceAnchor).toHaveBeenCalledWith(
      "trc_race",
      "mock_tx_signature_base58",
    );
  });
});
