import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError } from "../errors.js";
import type { PaymentExecutor } from "./types.js";

/**
 * Credit/prepaid balance executor.
 * When a vendor is in a curated registry (e.g. AgentCash — 338+ endpoints),
 * the agent can pay via prepaid balance instead of on-chain transactions.
 * Zero tx fee, fastest path.
 */

let creditApiKey: string | undefined;
let creditBalance = 0;
const registryDomains = new Set<string>();

export function setCreditConfig(config: {
  apiKey?: string;
  balance?: number;
  domains?: string[];
}) {
  creditApiKey = config.apiKey;
  creditBalance = config.balance ?? 0;
  if (config.domains) {
    registryDomains.clear();
    for (const d of config.domains) registryDomains.add(d);
  }
}

export function isInCreditRegistry(domain: string): boolean {
  return registryDomains.has(domain);
}

export const creditPayExecutor: PaymentExecutor = {
  protocol: "x402", // Can handle any protocol where the vendor is in the registry
  networks: ["*"],

  canExecute(detection: DetectionResult, _wallet: WalletConfig): boolean {
    if (!creditApiKey || creditBalance <= 0) return false;
    // Check if the vendor domain is in the credit registry
    try {
      const domain = new URL(detection.raw.headers["x-resource-url"] ?? "").hostname;
      return registryDomains.has(domain);
    } catch {
      return false;
    }
  },

  async execute(
    url: string,
    detection: DetectionResult,
    _wallet: WalletConfig,
    options: PayOptions,
  ): Promise<ExecutionResult> {
    if (!creditApiKey) {
      throw new ExecutionError("Credit API key not configured");
    }

    const priceUsd = Number(detection.priceRaw) / 1_000_000;
    if (priceUsd > creditBalance) {
      throw new ExecutionError(
        `Insufficient credit balance: $${creditBalance.toFixed(2)} < $${priceUsd.toFixed(2)}`,
      );
    }

    try {
      // Pay via credit balance — direct API call to the registry service
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          ...options.headers,
          Authorization: `Bearer ${creditApiKey}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        throw new ExecutionError(
          `Credit payment failed: ${response.status} ${response.statusText}`,
          response.status,
        );
      }

      // Deduct from local balance tracker
      creditBalance -= priceUsd;

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("json")
        ? await response.json()
        : await response.text();

      return {
        success: true,
        data,
        txHash: `credit_${Date.now().toString(36)}`,
        protocolReceipt: { type: "credit", amount: priceUsd, remainingBalance: creditBalance },
        response,
      };
    } catch (err) {
      if (err instanceof ExecutionError) throw err;
      throw new ExecutionError(
        `Credit payment failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};
