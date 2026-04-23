import type { DWallet, WalletBalance, SigningRequest, Chain } from "@/lib/types";
import type { WalletService } from "./wallet-service";

const MOCK_WALLETS: DWallet[] = [
  {
    id: "dw-treasury",
    fleetId: "fleet-001",
    dwalletType: "treasury",
    dwalletId: "ika-dw-treasury-001",
    dwalletCapId: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    supportedChains: ["ethereum", "base", "arbitrum"],
    status: "active",
    createdAt: Date.now() - 86400000 * 7,
  },
  {
    id: "dw-ceo",
    fleetId: "fleet-001",
    agentId: "agent-ceo-001",
    dwalletType: "agent",
    dwalletId: "ika-dw-ceo-001",
    dwalletCapId: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    supportedChains: ["base", "ethereum"],
    status: "active",
    createdAt: Date.now() - 86400000 * 5,
  },
  {
    id: "dw-research",
    fleetId: "fleet-001",
    agentId: "agent-research-001",
    dwalletType: "agent",
    dwalletId: "ika-dw-research-001",
    dwalletCapId: "9noXzpXBhFmQZfgTHhJoB7gPz9WxjEhMFH7cjN37xeGq",
    supportedChains: ["base"],
    status: "active",
    createdAt: Date.now() - 86400000 * 3,
  },
  {
    id: "dw-ops",
    fleetId: "fleet-001",
    agentId: "agent-ops-001",
    dwalletType: "agent",
    dwalletId: "ika-dw-ops-001",
    dwalletCapId: "2xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsU",
    supportedChains: ["base", "arbitrum"],
    status: "frozen",
    createdAt: Date.now() - 86400000 * 2,
  },
];

const MOCK_BALANCES: WalletBalance[] = [
  {
    id: "bal-1",
    dwalletId: "ika-dw-treasury-001",
    chain: "base",
    token: "USDC",
    amount: 25420.5,
    lastSyncedAt: Date.now() - 30000,
  },
  {
    id: "bal-2",
    dwalletId: "ika-dw-treasury-001",
    chain: "base",
    token: "ETH",
    amount: 2.847,
    lastSyncedAt: Date.now() - 30000,
  },
  {
    id: "bal-3",
    dwalletId: "ika-dw-treasury-001",
    chain: "ethereum",
    token: "USDC",
    amount: 12000.0,
    lastSyncedAt: Date.now() - 30000,
  },
  {
    id: "bal-4",
    dwalletId: "ika-dw-treasury-001",
    chain: "arbitrum",
    token: "USDC",
    amount: 8350.25,
    lastSyncedAt: Date.now() - 30000,
  },
  {
    id: "bal-5",
    dwalletId: "ika-dw-ceo-001",
    chain: "base",
    token: "USDC",
    amount: 4200.0,
    lastSyncedAt: Date.now() - 30000,
  },
  {
    id: "bal-6",
    dwalletId: "ika-dw-ceo-001",
    chain: "ethereum",
    token: "USDC",
    amount: 1500.0,
    lastSyncedAt: Date.now() - 30000,
  },
  {
    id: "bal-7",
    dwalletId: "ika-dw-research-001",
    chain: "base",
    token: "USDC",
    amount: 890.75,
    lastSyncedAt: Date.now() - 30000,
  },
  {
    id: "bal-8",
    dwalletId: "ika-dw-ops-001",
    chain: "base",
    token: "USDC",
    amount: 320.0,
    lastSyncedAt: Date.now() - 30000,
  },
  {
    id: "bal-9",
    dwalletId: "ika-dw-ops-001",
    chain: "arbitrum",
    token: "USDC",
    amount: 150.0,
    lastSyncedAt: Date.now() - 30000,
  },
];

const MOCK_SIGNING_REQUESTS: SigningRequest[] = [
  {
    id: "sr-1",
    agentId: "agent-ceo-001",
    fleetId: "fleet-001",
    dwalletId: "ika-dw-ceo-001",
    targetChain: "base",
    targetAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
    token: "USDC",
    amount: 250.0,
    status: "confirmed",
    targetTxHash: "0xabc123...",
    createdAt: Date.now() - 3600000,
    resolvedAt: Date.now() - 3540000,
  },
  {
    id: "sr-2",
    agentId: "agent-research-001",
    fleetId: "fleet-001",
    dwalletId: "ika-dw-research-001",
    targetChain: "base",
    targetAddress: "0x388C818CA8B9251b393131C08a736A67ccB19297",
    token: "USDC",
    amount: 75.5,
    status: "confirmed",
    targetTxHash: "0xdef456...",
    createdAt: Date.now() - 7200000,
    resolvedAt: Date.now() - 7150000,
  },
  {
    id: "sr-3",
    agentId: "agent-ops-001",
    fleetId: "fleet-001",
    dwalletId: "ika-dw-ops-001",
    targetChain: "arbitrum",
    targetAddress: "0x1234567890abcdef1234567890abcdef12345678",
    token: "USDC",
    amount: 5000.0,
    status: "rejected",
    rejectionReason: "Amount exceeds daily limit",
    createdAt: Date.now() - 1800000,
    resolvedAt: Date.now() - 1790000,
  },
  {
    id: "sr-4",
    agentId: "agent-ceo-001",
    fleetId: "fleet-001",
    dwalletId: "ika-dw-ceo-001",
    targetChain: "ethereum",
    targetAddress: "0x9876543210fedcba9876543210fedcba98765432",
    token: "USDC",
    amount: 1200.0,
    status: "pending",
    createdAt: Date.now() - 120000,
  },
];

export class MockWalletService implements WalletService {
  private wallets = [...MOCK_WALLETS];
  private balances = [...MOCK_BALANCES];
  private signingRequests = [...MOCK_SIGNING_REQUESTS];
  private listeners: Set<() => void> = new Set();

  getWallets(fleetId: string): DWallet[] {
    return this.wallets.filter((w) => w.fleetId === fleetId);
  }

  getTreasuryWallet(fleetId: string): DWallet | undefined {
    return this.wallets.find((w) => w.fleetId === fleetId && w.dwalletType === "treasury");
  }

  getAgentWallets(fleetId: string): DWallet[] {
    return this.wallets.filter((w) => w.fleetId === fleetId && w.dwalletType === "agent");
  }

  getBalances(dwalletId: string): WalletBalance[] {
    return this.balances.filter((b) => b.dwalletId === dwalletId);
  }

  getAllBalances(fleetId: string): WalletBalance[] {
    const walletIds = this.wallets.filter((w) => w.fleetId === fleetId).map((w) => w.dwalletId);
    return this.balances.filter((b) => walletIds.includes(b.dwalletId));
  }

  getSigningRequests(fleetId: string, limit = 50): SigningRequest[] {
    return this.signingRequests
      .filter((r) => r.fleetId === fleetId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  getSigningRequest(id: string): SigningRequest | undefined {
    return this.signingRequests.find((r) => r.id === id);
  }

  freezeWallet(dwalletId: string): void {
    const wallet = this.wallets.find((w) => w.dwalletId === dwalletId);
    if (wallet) {
      wallet.status = "frozen";
      this.notify();
    }
  }

  unfreezeWallet(dwalletId: string): void {
    const wallet = this.wallets.find((w) => w.dwalletId === dwalletId);
    if (wallet && wallet.status === "frozen") {
      wallet.status = "active";
      this.notify();
    }
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }
}
