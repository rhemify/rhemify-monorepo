import type { AgentCardConfig, CardDetails, CreateCardOptions } from "./types.js";

const DEFAULT_BASE_URL = "https://agentcard.ai";

/**
 * PLACEHOLDER — needs rewriting to match real agentcard.ai API.
 *
 * agentcard.ai uses CLI-based auth (magic link email) + Stripe Checkout
 * for card creation. The real flow is:
 *   1. POST /api/auth/sign-in/magic-link → user clicks email
 *   2. GET /api/auth/cli/poll?state=<uuid> → get bearer token
 *   3. POST /api/cards/purchase { amountCents } → Stripe Checkout URL
 *   4. User pays in browser → card provisioned
 *   5. GET /api/cards/<id>/details → { pan, cvv, expiryMonth, expiryYear }
 *
 * This client currently implements a simplified version that won't work
 * against the real API. It's kept as a structural placeholder.
 */
export class AgentCardClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: AgentCardConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * Create a single-use virtual card with the given spending limit.
   * The card auto-closes after one transaction.
   */
  async createCard(options: CreateCardOptions): Promise<CardDetails> {
    const res = await fetch(`${this.baseUrl}/v1/cards`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: options.amount,
        currency: options.currency ?? "usd",
        label: options.label,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `AgentCard API error ${res.status}: ${text || res.statusText}`,
      );
    }

    return res.json() as Promise<CardDetails>;
  }

  /** Check if the AgentCard API is reachable. */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
