export interface AgentIdentity {
  domain: string; // e.g., "ceo-001.rhemify.sol"
  parentDomain: string; // e.g., "rhemify.sol"
  agentKey: string; // e.g., "ceo-001"
  owner: string; // Solana public key (base58)
  dwalletId?: string; // Ika dWallet ID if registered
  fleetVaultPda?: string; // Fleet vault PDA on Solana
}

export interface IdentityConfig {
  /** Parent .sol domain owned by the fleet operator (e.g., "rhemify") */
  parentDomain: string;
  /** Solana RPC URL */
  rpcUrl: string;
}
