import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { MerkleTree, verifyMerkleProof } from "../src/anchor/merkle.js";
import { verifyTrace } from "../src/anchor/verify.js";

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("MerkleTree", () => {
  it("builds a tree from a single hash", () => {
    const hash = sha256("trace-1");
    const tree = new MerkleTree([hash]);

    expect(tree.rootHex()).toHaveLength(64);
    expect(tree.leaves).toHaveLength(1); // padded to power of 2 = 1
  });

  it("builds a tree from two hashes", () => {
    const hashes = [sha256("trace-1"), sha256("trace-2")];
    const tree = new MerkleTree(hashes);

    expect(tree.rootHex()).toHaveLength(64);
    expect(tree.leaves).toHaveLength(2);
    expect(tree.layers).toHaveLength(2); // leaves + root
  });

  it("builds a tree from 5 hashes (pads to 8)", () => {
    const hashes = Array.from({ length: 5 }, (_, i) => sha256(`trace-${i}`));
    const tree = new MerkleTree(hashes);

    expect(tree.leaves).toHaveLength(8); // next power of 2
    expect(tree.layers).toHaveLength(4); // 8 → 4 → 2 → 1
  });

  it("builds a tree from 1000 hashes", () => {
    const hashes = Array.from({ length: 1000 }, (_, i) => sha256(`trace-${i}`));
    const tree = new MerkleTree(hashes);

    expect(tree.leaves).toHaveLength(1024); // next power of 2
    expect(tree.rootHex()).toHaveLength(64);
    expect(tree.rootBytes()).toHaveLength(32);
  });

  it("throws on empty hash list", () => {
    expect(() => new MerkleTree([])).toThrow("empty");
  });

  it("deterministic — same hashes produce same root", () => {
    const hashes = [sha256("a"), sha256("b"), sha256("c")];
    const tree1 = new MerkleTree(hashes);
    const tree2 = new MerkleTree(hashes);

    expect(tree1.rootHex()).toBe(tree2.rootHex());
  });

  it("different hashes produce different roots", () => {
    const tree1 = new MerkleTree([sha256("a"), sha256("b")]);
    const tree2 = new MerkleTree([sha256("a"), sha256("c")]);

    expect(tree1.rootHex()).not.toBe(tree2.rootHex());
  });
});

describe("MerkleTree proofs", () => {
  it("generates a valid proof for each leaf", () => {
    const hashes = Array.from({ length: 8 }, (_, i) => sha256(`trace-${i}`));
    const tree = new MerkleTree(hashes);

    for (let i = 0; i < hashes.length; i++) {
      const proof = tree.getProofHex(i);
      const valid = verifyMerkleProof(hashes[i]!, proof, tree.rootHex());
      expect(valid).toBe(true);
    }
  });

  it("generates valid proofs for large tree", () => {
    const hashes = Array.from({ length: 100 }, (_, i) => sha256(`trace-${i}`));
    const tree = new MerkleTree(hashes);

    // Spot check a few indices
    for (const i of [0, 1, 50, 99]) {
      const proof = tree.getProofHex(i);
      const valid = verifyMerkleProof(hashes[i]!, proof, tree.rootHex());
      expect(valid).toBe(true);
    }
  });

  it("proof fails for wrong leaf", () => {
    const hashes = [sha256("a"), sha256("b"), sha256("c"), sha256("d")];
    const tree = new MerkleTree(hashes);

    const proofForA = tree.getProofHex(0);
    const valid = verifyMerkleProof(sha256("WRONG"), proofForA, tree.rootHex());
    expect(valid).toBe(false);
  });

  it("proof fails for wrong root", () => {
    const hashes = [sha256("a"), sha256("b")];
    const tree = new MerkleTree(hashes);

    const proof = tree.getProofHex(0);
    const valid = verifyMerkleProof(hashes[0]!, proof, sha256("fake-root"));
    expect(valid).toBe(false);
  });

  it("proof fails for tampered proof", () => {
    const hashes = [sha256("a"), sha256("b"), sha256("c"), sha256("d")];
    const tree = new MerkleTree(hashes);

    const proof = tree.getProofHex(0);
    proof[0] = sha256("tampered"); // corrupt first sibling
    const valid = verifyMerkleProof(hashes[0]!, proof, tree.rootHex());
    expect(valid).toBe(false);
  });

  it("indexOf finds correct leaf index", () => {
    const hashes = [sha256("a"), sha256("b"), sha256("c")];
    const tree = new MerkleTree(hashes);

    expect(tree.indexOf(hashes[0]!)).toBe(0);
    expect(tree.indexOf(hashes[1]!)).toBe(1);
    expect(tree.indexOf(hashes[2]!)).toBe(2);
    expect(tree.indexOf(sha256("not-in-tree"))).toBe(-1);
  });

  it("throws on out-of-bounds index", () => {
    const tree = new MerkleTree([sha256("a")]);
    expect(() => tree.getProof(-1)).toThrow("out of bounds");
    expect(() => tree.getProof(999)).toThrow("out of bounds");
  });
});

describe("verifyTrace", () => {
  it("verifies a valid trace hash", () => {
    // Reproduce the same canonical JSON that Trace.finalize() uses
    const canonical = JSON.stringify({
      id: "trc_abc123",
      protocol: "x402",
      amount: "$0.50",
      network: "solana-mainnet",
      agentId: "agent-1",
      fleetId: "fleet-1",
      url: "https://api.example.com",
      timestamp: "2026-04-06T12:00:00Z",
    });
    const expectedHash = createHash("sha256").update(canonical).digest("hex");

    const result = verifyTrace({
      traceId: "trc_abc123",
      protocol: "x402",
      amount: "$0.50",
      network: "solana-mainnet",
      agentId: "agent-1",
      fleetId: "fleet-1",
      url: "https://api.example.com",
      timestamp: "2026-04-06T12:00:00Z",
      expectedHash,
    });

    expect(result.hashValid).toBe(true);
    expect(result.computedHash).toBe(expectedHash);
    expect(result.merkleValid).toBeNull(); // no merkle proof provided
  });

  it("detects tampered trace data", () => {
    const canonical = JSON.stringify({
      id: "trc_abc123",
      protocol: "x402",
      amount: "$0.50",
      network: "solana-mainnet",
      agentId: "agent-1",
      fleetId: "fleet-1",
      url: "https://api.example.com",
      timestamp: "2026-04-06T12:00:00Z",
    });
    const originalHash = createHash("sha256").update(canonical).digest("hex");

    // Tamper: change the amount
    const result = verifyTrace({
      traceId: "trc_abc123",
      protocol: "x402",
      amount: "$999.00", // TAMPERED
      network: "solana-mainnet",
      agentId: "agent-1",
      fleetId: "fleet-1",
      url: "https://api.example.com",
      timestamp: "2026-04-06T12:00:00Z",
      expectedHash: originalHash,
    });

    expect(result.hashValid).toBe(false);
  });

  it("verifies trace with Merkle proof", () => {
    const traceHash = sha256("trace-data");
    const hashes = [traceHash, sha256("other-1"), sha256("other-2"), sha256("other-3")];
    const tree = new MerkleTree(hashes);
    const proof = tree.getProofHex(0);

    const result = verifyTrace(
      {
        traceId: "trc_1",
        protocol: "x402",
        amount: "$0.50",
        network: "solana-mainnet",
        agentId: "agent-1",
        fleetId: "fleet-1",
        url: "https://example.com",
        timestamp: "2026-04-06T12:00:00Z",
        expectedHash: "anything", // hash check will fail, but merkle is separate
      },
      {
        traceHash,
        proof,
        merkleRoot: tree.rootHex(),
      },
    );

    expect(result.merkleValid).toBe(true);
  });
});
