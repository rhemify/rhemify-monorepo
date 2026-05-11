import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".rhemify");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const WALLET_FILE = join(CONFIG_DIR, "wallet.json");

export interface RhemifyConfig {
  fleetId: string;
  fleetName: string;
  agentIds: string[];
  serverUrl: string;
  /**
   * Convex deployment URL — used by read-mostly commands that talk to
   * Convex directly (`traces list`, future `agents list`, etc.).
   * Optional in config because pre-Phase-N onboards didn't set it; falls
   * back to env var CONVEX_URL or DEFAULT_CONVEX_URL.
   */
  convexUrl?: string;
  createdAt: string;
}

/** Default local anonymous Convex deployment (`bunx convex dev` in packages/backend). */
export const DEFAULT_CONVEX_URL = "http://127.0.0.1:3210";

/**
 * Resolves the Convex URL using the priority: explicit override > config > env > default.
 * Used by every command that talks to Convex directly. Single source of truth.
 */
export function resolveConvexUrl(override?: string): string {
  if (override) return override;
  const cfg = loadConfig();
  if (cfg?.convexUrl) return cfg.convexUrl;
  const env = process.env.CONVEX_URL;
  if (env) return env;
  return DEFAULT_CONVEX_URL;
}

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): RhemifyConfig | null {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveConfig(config: RhemifyConfig) {
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
