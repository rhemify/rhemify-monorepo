import type { DWallet, WalletBalance, SigningRequest, Chain } from "@/lib/types";

export interface WalletService {
  getWallets(fleetId: string): DWallet[];
  getTreasuryWallet(fleetId: string): DWallet | undefined;
  getAgentWallets(fleetId: string): DWallet[];

  getBalances(dwalletId: string): WalletBalance[];
  getAllBalances(fleetId: string): WalletBalance[];

  getSigningRequests(fleetId: string, limit?: number): SigningRequest[];
  getSigningRequest(id: string): SigningRequest | undefined;

  freezeWallet(dwalletId: string): void;
  unfreezeWallet(dwalletId: string): void;

  subscribe(callback: () => void): () => void;
}
