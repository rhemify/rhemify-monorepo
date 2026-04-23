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
    expect(transport.updateTraceAnchor).toHaveBeenCalledWith(
      "trc_1",
      "mock_tx_signature_base58",
    );
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
});
