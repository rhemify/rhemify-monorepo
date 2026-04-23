import { Connection, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import type { AgentIdentity } from "./types.js";

export type { AgentIdentity, IdentityConfig } from "./types.js";

/**
 * Resolves a .sol domain to its owner public key.
 * Works for both parent domains and subdomains.
 */
export async function resolveIdentity(
  domain: string,
  rpcUrl: string,
): Promise<AgentIdentity | null> {
  // Lazy import to avoid bundling SNS SDK when identity isn't used
  const { resolve } = await import("@bonfida/spl-name-service");
  const connection = new Connection(rpcUrl);

  // Normalize domain: strip .sol suffix for SNS SDK
  const normalized = domain.endsWith(".sol") ? domain.slice(0, -4) : domain;
  const parts = normalized.split(".");

  try {
    const owner = await resolve(connection, normalized);

    const isSubdomain = parts.length >= 2;
    const agentKey = isSubdomain ? parts[0]! : "";
    const parentDomain = isSubdomain ? parts.slice(1).join(".") + ".sol" : domain;

    return {
      domain: normalized + ".sol",
      parentDomain,
      agentKey,
      owner: owner.toBase58(),
    };
  } catch {
    return null;
  }
}

/**
 * Creates instructions to register an agent subdomain.
 * Requires the parent domain owner to sign.
 *
 * @param parentDomain - Parent domain without .sol (e.g., "rhemify")
 * @param agentKey - Agent identifier (e.g., "ceo-001")
 * @param ownerPubkey - Public key of the parent domain owner
 * @param rpcUrl - Solana RPC URL
 * @returns Transaction instructions to create the subdomain
 */
export async function createAgentSubdomain(
  parentDomain: string,
  agentKey: string,
  ownerPubkey: string,
  rpcUrl: string,
): Promise<TransactionInstruction[]> {
  const { createSubdomain } = await import("@bonfida/spl-name-service");
  const connection = new Connection(rpcUrl);

  const subdomain = `${agentKey}.${parentDomain}`;
  const owner = new PublicKey(ownerPubkey);

  return createSubdomain(connection, subdomain, owner, 1_000);
}

/**
 * Finds all agent subdomains under a fleet's parent domain.
 */
export async function findAgentSubdomains(
  parentDomain: string,
  rpcUrl: string,
): Promise<AgentIdentity[]> {
  const { findSubdomains, resolve } = await import("@bonfida/spl-name-service");
  const { getDomainKeySync } = await import("@bonfida/spl-name-service");
  const connection = new Connection(rpcUrl);

  const normalized = parentDomain.endsWith(".sol") ? parentDomain.slice(0, -4) : parentDomain;

  try {
    const subdomains = await findSubdomains(connection, getDomainKeySync(normalized).pubkey);
    const results: AgentIdentity[] = [];

    for (const sub of subdomains) {
      const fullDomain = `${sub}.${normalized}`;
      try {
        const owner = await resolve(connection, fullDomain);
        results.push({
          domain: fullDomain + ".sol",
          parentDomain: normalized + ".sol",
          agentKey: sub,
          owner: owner.toBase58(),
        });
      } catch {
        // Skip unresolvable subdomains
      }
    }

    return results;
  } catch {
    return [];
  }
}
