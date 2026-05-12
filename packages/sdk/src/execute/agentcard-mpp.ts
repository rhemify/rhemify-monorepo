import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError } from "../errors.js";
import { AgentCardClient } from "../agentcard/client.js";
import type { PaymentExecutor } from "./types.js";

/**
 * AgentCard MPP executor — fiat payment path via virtual Visa.
 *
 * STATUS: STUB — canExecute returns false.
 *
 * agentcard.ai uses CLI-based auth (magic link email) + Stripe Checkout
 * for card creation, not a simple REST card provisioning API.
 * Real integration requires either:
 *   1. Subprocess calls to `agentcard` CLI (npm install -g agentcard)
 *   2. Direct REST with pre-authenticated bearer token from ~/.agentcard/config.json
 *
 * API endpoints (for future implementation):
 *   POST /api/auth/sign-in/magic-link → sends auth email
 *   GET  /api/auth/cli/poll?state=<uuid> → polls for auth token
 *   POST /api/cards/purchase → returns Stripe Checkout URL + sessionId
 *   GET  /api/cards/purchase/status?session_id=<id> → polls card provisioning
 *   GET  /api/cards/<id>/details → { pan, cvv, expiryMonth, expiryYear, amountCents }
 *
 * Cards are $5-$200 (multiples of $5), US merchants only.
 */

// AgentCard API key — kept for future implementation
let agentcardApiKey: string | undefined;

export function setAgentCardApiKey(key: string | undefined) {
  agentcardApiKey = key;
}

export const agentcardMppExecutor: PaymentExecutor = {
  protocol: "mpp",
  networks: ["*"],

  canExecute(_detection: DetectionResult, _wallet: WalletConfig): boolean {
    // STUB: agentcard.ai integration not implemented (see file-header STATUS).
    // To re-enable once a real card-provisioning path lands, replace the
    // body with:
    //   return _detection.protocol === "mpp" && !!agentcardApiKey;
    return false;
  },

  async execute(
    url: string,
    detection: DetectionResult,
    _wallet: WalletConfig,
    options: PayOptions,
  ): Promise<ExecutionResult> {
    if (!agentcardApiKey) {
      throw new ExecutionError("AgentCard API key not configured");
    }

    const client = new AgentCardClient({ apiKey: agentcardApiKey });

    try {
      // Convert price to cents for card provisioning
      const priceUsd = Number(detection.priceRaw) / 1_000_000;
      const amountCents = Math.ceil(priceUsd * 100 * 1.1); // 10% buffer for processing

      // Provision a single-use card with the payment amount
      const card = await client.createCard({
        amount: amountCents,
        currency: "usd",
        label: `rhemify-${detection.protocol}-${Date.now()}`,
      });

      // Use the card to fulfill the MPP payment challenge
      // Send card details as the payment credential in the Authorization header
      const paymentCredential = btoa(JSON.stringify({
        type: "card",
        cardId: card.cardId,
        last4: card.cardNumber.slice(-4),
      }));

      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          ...options.headers,
          "Authorization": `Payment ${paymentCredential}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        throw new ExecutionError(
          `AgentCard MPP payment failed: ${response.status} ${response.statusText}`,
          response.status,
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("json")
        ? await response.json()
        : await response.text();

      const txHash =
        response.headers.get("payment-receipt") ??
        response.headers.get("x-payment-receipt") ??
        undefined;

      return {
        success: true,
        data,
        txHash: txHash ?? card.cardId,
        protocolReceipt: { cardId: card.cardId, txHash },
        response,
      };
    } catch (err) {
      if (err instanceof ExecutionError) throw err;
      throw new ExecutionError(
        `AgentCard MPP payment failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};
