import type {
  FleetStatus,
  PaymentEvent,
  PaymentTrace,
  PolicyConfig,
  PolicyContext,
  PolicyDecisionEvent,
} from "../types.js";

export interface IngestPayload {
  event: PaymentEvent;
  trace: PaymentTrace;
  policyDecisions: PolicyDecisionEvent[];
}

export interface IngestResult {
  eventId: string;
  traceId: string;
}

export class GoServerTransport {
  private baseUrl: string;
  private apiKey: string;

  constructor(serverUrl: string, fleetApiKey: string) {
    this.baseUrl = serverUrl.replace(/\/$/, "");
    this.apiKey = fleetApiKey;
  }

  async getPolicy(agentId: string): Promise<PolicyContext> {
    const res = await this.request("GET", `/api/policy/${agentId}`);
    return res as PolicyContext;
  }

  async setPolicy(
    agentId: string,
    policy: Partial<PolicyConfig>,
  ): Promise<void> {
    await this.request("POST", `/api/policy/${agentId}`, policy);
  }

  async ingestPayment(payload: IngestPayload): Promise<IngestResult> {
    const res = await this.request("POST", "/api/ingest/payment", payload);
    return res as IngestResult;
  }

  async updateTraceAnchor(
    traceId: string,
    anchorTxHash: string,
  ): Promise<void> {
    await this.request("PATCH", `/api/traces/${traceId}/anchor`, {
      anchorTxHash,
    });
  }

  async getFleetStatus(): Promise<FleetStatus> {
    const res = await this.request("GET", "/api/fleet/status");
    return res as FleetStatus;
  }

  async getVendorStatus(
    domain: string,
  ): Promise<{
    domain: string;
    isBlocked: boolean;
    successRate: number;
    avgLatencyMs: number;
  }> {
    const res = await this.request(
      "GET",
      `/api/vendor/${encodeURIComponent(domain)}`,
    );
    return res as {
      domain: string;
      isBlocked: boolean;
      successRate: number;
      avgLatencyMs: number;
    };
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Go server ${method} ${path} failed: ${res.status} ${text}`,
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
      return res.json();
    }

    // Non-JSON response (e.g. 204 No Content)
    const text = await res.text();
    return text || null;
  }
}
