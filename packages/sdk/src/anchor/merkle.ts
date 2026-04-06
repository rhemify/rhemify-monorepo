import { createHash } from "node:crypto";

/**
 * SHA-256 Merkle tree for batching trace hashes.
 * Built in-memory — only the root goes onchain (via Anchor program PDA).
 * Individual proofs are stored in Convex for verification.
 */
export class MerkleTree {
  readonly leaves: Array<string>;
  private readonly layers: Array<Array<string>>;
  readonly root: string;

  constructor(hashes: Array<string>) {
    if (hashes.length === 0) {
      throw new Error("Cannot build Merkle tree from empty hash list");
    }

    // Copy and pad to power of 2 with zero-hashes
    this.leaves = [...hashes];
    const targetSize = nextPowerOf2(this.leaves.length);
    const zeroHash = "0".repeat(64);
    while (this.leaves.length < targetSize) {
      this.leaves.push(zeroHash);
    }

    this.layers = [this.leaves];
    let currentLayer = this.leaves;

    while (currentLayer.length > 1) {
      const nextLayer: Array<string> = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        nextLayer.push(hashPair(currentLayer[i]!, currentLayer[i + 1]!));
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }

    this.root = currentLayer[0]!;
  }

  /** Get the Merkle root as hex string */
  rootHex(): string {
    return this.root;
  }

  /** Get the Merkle root as Uint8Array (for onchain PDA) */
  rootBytes(): Uint8Array {
    return hexToBytes(this.root);
  }

  /**
   * Generate a proof for a leaf at the given index.
   * Returns sibling hashes needed to recompute root from leaf.
   */
  getProof(index: number): Array<string> {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Index ${index} out of bounds (${this.leaves.length} leaves)`);
    }

    const proof: Array<string> = [];
    let currentIndex = index;

    for (let layerIndex = 0; layerIndex < this.layers.length - 1; layerIndex++) {
      const layer = this.layers[layerIndex]!;
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

      if (siblingIndex < layer.length) {
        proof.push(layer[siblingIndex]!);
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  /** Alias for getProof (already returns hex strings) */
  getProofHex(index: number): Array<string> {
    return this.getProof(index);
  }

  /**
   * Find the index of a leaf by its hex hash.
   * Returns -1 if not found.
   */
  indexOf(hashHex: string): number {
    return this.leaves.indexOf(hashHex);
  }
}

/**
 * Verify a Merkle proof: does this leaf + proof produce the expected root?
 * Standalone function — doesn't need the full tree.
 */
export function verifyMerkleProof(
  leafHex: string,
  proofHex: Array<string>,
  rootHex: string,
): boolean {
  let current = leafHex;

  for (const sibling of proofHex) {
    current = hashPair(current, sibling);
  }

  return current === rootHex;
}

function hashPair(a: string, b: string): string {
  // Consistent ordering: smaller hash on left
  const [left, right] = a <= b ? [a, b] : [b, a];
  const combined = Buffer.concat([hexToBytes(left!), hexToBytes(right!)]);
  return createHash("sha256").update(combined).digest("hex");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function nextPowerOf2(n: number): number {
  let power = 1;
  while (power < n) {
    power *= 2;
  }
  return power;
}
