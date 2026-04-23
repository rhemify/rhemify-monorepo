import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".rhemify");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const WALLET_FILE = join(CONFIG_DIR, "wallet.json");

export interface RhemosConfig {
  fleetId: string;
  fleetName: string;
  agentIds: string[];
  serverUrl: string;
  createdAt: string;
}

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): RhemosConfig | null {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveConfig(config: RhemosConfig) {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function loadWallet(): number[] | null {
  try {
    const raw = readFileSync(WALLET_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveWallet(keypairBytes: number[]) {
  ensureDir();
  writeFileSync(WALLET_FILE, JSON.stringify(keypairBytes));
}

export function walletExists(): boolean {
  return existsSync(WALLET_FILE);
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export { CONFIG_DIR, CONFIG_FILE, WALLET_FILE };
