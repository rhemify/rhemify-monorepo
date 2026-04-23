export interface AgentCardConfig {
  apiKey: string;
  baseUrl?: string; // defaults to https://api.agentcard.sh
}

export interface CreateCardOptions {
  /** Spending limit in cents (e.g. 1500 = $15.00) */
  amount: number;
  /** Currency code */
  currency?: string;
  /** Label for the card (e.g. agent name) */
  label?: string;
}

export interface CardDetails {
  cardId: string;
  cardNumber: string;
  expirationMonth: string;
  expirationYear: string;
  cvv: string;
  amount: number;
  currency: string;
  status: "active" | "used" | "expired" | "cancelled";
}
