import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRhemos } from "@rhemify-monorepo/sdk";
import type { Rhemos, MppSession } from "@rhemify-monorepo/sdk";

// Config from environment
const SERVER_URL = process.env.RHEMOS_SERVER_URL ?? "http://localhost:8080";
const FLEET_API_KEY = process.env.RHEMOS_FLEET_API_KEY ?? "";
const AGENT_ID = process.env.RHEMOS_AGENT_ID ?? "agent-1";
const FLEET_ID = process.env.RHEMOS_FLEET_ID ?? "fleet-1";
const SOLANA_PRIVATE_KEY = process.env.RHEMOS_SOLANA_PRIVATE_KEY ?? "";
const EVM_PRIVATE_KEY = process.env.RHEMOS_EVM_PRIVATE_KEY ?? "";
const SOLANA_RPC_URL = process.env.RHEMOS_SOLANA_RPC_URL ?? "";

let rhemos: Rhemos;
let activeSession: MppSession | null = null;

function getRhemos(): Rhemos {
  if (!rhemos) {
    rhemos = createRhemos({
      serverUrl: SERVER_URL,
      fleetApiKey: FLEET_API_KEY,
      agentId: AGENT_ID,
      fleetId: FLEET_ID,
      wallet: {
        solanaPrivateKey: SOLANA_PRIVATE_KEY || undefined,
        evmPrivateKey: EVM_PRIVATE_KEY || undefined,
      },
      solanaRpcUrl: SOLANA_RPC_URL || undefined,
      anchor: {
        enabled: !!SOLANA_PRIVATE_KEY && !!SOLANA_RPC_URL,
        rpcUrl: SOLANA_RPC_URL || undefined,
      },
    });
  }
  return rhemos;
}

const server = new McpServer({
  name: "rhemos",
  version: "0.1.0",
});

// --- Tool: rhemos.pay ---
server.registerTool(
  "rhemos_pay",
  {
    title: "Rhemos Pay",
    description:
      "Pay for a resource at a URL. Detects the payment standard (x402, MPP, L402), " +
      "enforces fleet policy, resolves the optimal payment path, executes payment, " +
      "and returns a verifiable decision trace anchored on Solana.",
    inputSchema: {
      url: z.string().url().describe("The URL to pay for"),
      method: z
        .enum(["GET", "POST", "PUT", "DELETE"])
        .optional()
        .describe("HTTP method (default GET)"),
      body: z
        .string()
        .optional()
        .describe("Request body as JSON string (for POST/PUT)"),
      maxBudget: z
        .string()
        .optional()
        .describe('Maximum budget for this payment (e.g. "$1.00")'),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "If true, run detect + policy + resolve without executing payment",
        ),
      taskContext: z
        .string()
        .optional()
        .describe("Description of the agent task requiring this payment"),
      taskStep: z
        .number()
        .optional()
        .describe("Current step number in the agent task"),
    },
  },
  async (args) => {
    try {
      const result = await getRhemos().pay(args.url, {
        method: args.method,
        body: args.body ? JSON.parse(args.body) : undefined,
        maxBudget: args.maxBudget,
        dryRun: args.dryRun,
        taskContext: args.taskContext,
        taskStep: args.taskStep,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: result.success,
                data: result.data,
                trace: {
                  id: result.trace.id,
                  protocol: result.trace.protocol,
                  amount: result.trace.amount,
                  traceHash: result.trace.traceHash,
                  chosenPath: result.trace.chosenPath.instrument,
                  policyRules: result.trace.policyRulesFired.length,
                  alternatives: result.trace.alternativesEvaluated.length,
                },
                receipt: result.receipt,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Payment failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Tool: rhemos.probe ---
server.registerTool(
  "rhemos_probe",
  {
    title: "Rhemos Probe",
    description:
      "Detect the payment protocol and check if a payment would be allowed by policy, " +
      "without executing. Returns detection result, policy evaluation, estimated paths and costs.",
    inputSchema: {
      url: z.string().url().describe("The URL to probe"),
      method: z
        .enum(["GET", "POST", "PUT", "DELETE"])
        .optional()
        .describe("HTTP method (default GET)"),
    },
  },
  async (args) => {
    try {
      const result = await getRhemos().probe(args.url, {
        method: args.method,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                canPay: result.canPay,
                protocol: result.detection.protocol,
                price: result.detection.price,
                network: result.detection.network,
                policyAction: result.policyDecision.action,
                policyReason: result.policyDecision.reason ?? null,
                estimatedCost: result.estimatedCost,
                availablePaths: result.estimatedPaths
                  .filter((p) => p.available)
                  .map((p) => ({
                    instrument: p.instrument,
                    cost: p.estimatedCost,
                    risk: p.risk,
                  })),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Probe failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Tool: rhemos.session ---
server.registerTool(
  "rhemos_session",
  {
    title: "Rhemos Session",
    description:
      "Open an MPP streaming session for repeated payments to the same vendor. " +
      "Returns a session ID. Use rhemos_session_fetch to make requests within the session, " +
      "and rhemos_session_close to settle and close.",
    inputSchema: {
      action: z
        .enum(["open", "fetch", "close", "status"])
        .describe("Session action to perform"),
      url: z
        .string()
        .optional()
        .describe("URL to fetch within the session (for 'fetch' action)"),
      maxDeposit: z
        .string()
        .optional()
        .describe('Maximum deposit for the session (e.g. "$5.00", for "open" action)'),
      taskContext: z
        .string()
        .optional()
        .describe("Agent task description (for 'open' action)"),
    },
  },
  async (args) => {
    try {
      switch (args.action) {
        case "open": {
          if (activeSession) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "A session is already open. Close it first with action='close'.",
                },
              ],
              isError: true,
            };
          }
          activeSession = await getRhemos().session({
            maxDeposit: args.maxDeposit,
            taskContext: args.taskContext,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  status: "opened",
                  remaining: activeSession.remaining(),
                  spent: activeSession.spent(),
                }),
              },
            ],
          };
        }
        case "fetch": {
          if (!activeSession) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No active session. Open one first with action='open'.",
                },
              ],
              isError: true,
            };
          }
          if (!args.url) {
            return {
              content: [
                { type: "text" as const, text: "URL is required for fetch action." },
              ],
              isError: true,
            };
          }
          const response = await activeSession.fetch(args.url);
          const data = await response.text();
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  status: response.status,
                  spent: activeSession.spent(),
                  remaining: activeSession.remaining(),
                  data: data.slice(0, 2000),
                }),
              },
            ],
          };
        }
        case "close": {
          if (!activeSession) {
            return {
              content: [
                { type: "text" as const, text: "No active session to close." },
              ],
              isError: true,
            };
          }
          const result = await activeSession.close();
          activeSession = null;
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  status: "closed",
                  totalSpent: result.totalSpent,
                  requestCount: result.requestCount,
                  txHash: result.txHash,
                  traceIds: result.traceIds,
                }),
              },
            ],
          };
        }
        case "status": {
          if (!activeSession) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ active: false }),
                },
              ],
            };
          }
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  active: true,
                  spent: activeSession.spent(),
                  remaining: activeSession.remaining(),
                }),
              },
            ],
          };
        }
      }
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Session error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Tool: rhemos.status ---
server.registerTool(
  "rhemos_status",
  {
    title: "Rhemos Status",
    description:
      "Get the current fleet status: agent spend today, daily limit, active agents, blocked domains.",
    inputSchema: {},
  },
  async () => {
    try {
      const status = await getRhemos().status();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Status failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Tool: rhemos.set_policy ---
server.registerTool(
  "rhemos_set_policy",
  {
    title: "Rhemos Set Policy",
    description:
      "Update the agent's payment policy. Changes take effect on the next payment.",
    inputSchema: {
      dailyLimit: z
        .number()
        .optional()
        .describe("Maximum daily spend in USD"),
      maxPerTransaction: z
        .number()
        .optional()
        .describe("Maximum per-transaction spend in USD"),
      approvalThreshold: z
        .number()
        .optional()
        .describe("Payments above this amount require approval (0 = disabled)"),
      allowedStandards: z
        .array(z.enum(["x402", "mpp", "l402", "ap2", "acp", "unknown"]))
        .optional()
        .describe('Allowed payment standards (e.g. ["x402", "mpp"]). Empty = allow all.'),
      domainAllowlist: z
        .array(z.string())
        .optional()
        .describe("Allowed domains. Empty = allow all."),
    },
  },
  async (args) => {
    try {
      await getRhemos().setPolicy(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, updated: Object.keys(args) }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Set policy failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Rhemos MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Failed to start Rhemos MCP server:", err);
  process.exit(1);
});
