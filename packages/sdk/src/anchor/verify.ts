import { createHash } from "node:crypto";
import { verifyMerkleProof } from "./merkle.js";

export interface MemoVerificationInput {
  /** The trace data fields to recompute the hash from */
  traceId: string;
  protocol: string;
  amount: string;
  network: string;
  agentId: string;
  fleetId: string;
  url: string;
  timestamp: string;
  /** The expected hash (from the Memo payload) */
  expectedHash: string;
}

export interface MerkleVerificationInput {
  /** The trace hash (leaf) */
  traceHash: string;
  /** Merkle proof (sibling hashes) */
  proof: Array<string>;
  /** Expected Merkle root (from onchain PDA) */
  merkleRoot: string;
}

export interface VerificationResult {
  /** Does the trace hash match the canonical data? */
  hashValid: boolean;
  /** Is the trace included in the daily Merkle root? */
  merkleValid: boolean | null;
  /** Computed hash from the provided trace data */
  computedHash: string;
}

/**
 * Verify a trace's integrity:
 * 1. Recompute SHA-256 from canonical fields, compare to expected hash
 * 2. If Merkle proof provided, verify inclusion in the daily root
 *
 * This is a pure function — no network calls. The caller fetches
 * the onchain data (Memo tx, PDA) and passes it in.
 */
export function verifyTrace(
  memo: MemoVerificationInput,
  merkle?: MerkleVerificationInput,
): VerificationResult {
  // Recompute the canonical hash (same logic as Trace.finalize())
  const canonical = JSON.stringify({
    id: memo.traceId,
    protocol: memo.protocol,
    amount: memo.amount,
    network: memo.network,
    agentId: memo.agentId,
    fleetId: memo.fleetId,
    url: memo.url,
    timestamp: memo.timestamp,
  });

  const computedHash = createHash("sha256").update(canonical).digest("hex");
  const hashValid = computedHash === memo.expectedHash;

  let merkleValid: boolean | null = null;
  if (merkle) {
    merkleValid = verifyMerkleProof(merkle.traceHash, merkle.proof, merkle.merkleRoot);
  }

  return { hashValid, merkleValid, computedHash };
}
