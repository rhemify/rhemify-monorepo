/**
 * Real 402 endpoint configuration for integration testing.
 * These are live endpoints verified to return HTTP 402 responses.
 */

export interface RealEndpoint {
  name: string;
  url: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  expectedProtocol: "x402" | "mpp";
  expectedNetwork: string;
  description: string;
}

export const REAL_ENDPOINTS: RealEndpoint[] = [
  {
    name: "x402.org (Solana Devnet)",
    url: "https://www.x402.org/protected",
    method: "GET",
    expectedProtocol: "x402",
    expectedNetwork: "solana-devnet",
    description: "x402 Foundation test endpoint. 0.01 USDC on Solana Devnet. Data in payment-required header (base64 JSON).",
  },
  {
    name: "Parallel MPP Search",
    url: "https://parallelmpp.dev/api/search",
    method: "POST",
    body: { query: "test", mode: "one-shot" },
    headers: { "Content-Type": "application/json" },
    expectedProtocol: "mpp",
    expectedNetwork: "solana-devnet", // Tempo chain 4217, mapped to solana-devnet for now
    description: "Parallel API Gateway. MPP search endpoint. $0.01 per call via Tempo stablecoins.",
  },
];
