export { createRhemify } from "./client.js";
export { discover, invalidateDiscoveryCache } from "./discovery/index.js";
export type { ServiceCandidate } from "./discovery/index.js";
export { detectProtocol, detectFromResponse } from "./detect/index.js";
export type { ProtocolDetector } from "./detect/types.js";
export { PolicyEngine } from "./policy/index.js";
export { PathResolver } from "./resolve/index.js";
export { selectExecutor, executeWithCascade } from "./execute/index.js";
export { Trace } from "./trace/index.js";
export {
  AnchorQueue,
  sendMemoTransaction,
  buildMemoPayload,
  MerkleTree,
  verifyMerkleProof,
  verifyTrace,
} from "./anchor/index.js";
export type {
  AnchorQueueConfig,
  MemoPayload,
  SendMemoOptions,
  MemoVerificationInput,
  MerkleVerificationInput,
  VerificationResult,
} from "./anchor/index.js";

export type {
  Rhemify,
  RhemifyConfig,
  PayOptions,
  PayResult,
  ProbeOptions,
  ProbeResult,
  SessionOptions,
  MppSession,
  SessionCloseResult,
  FleetStatus,
  PolicyConfig,
  PolicyDecision,
  PolicyDecisionRecord,
  PolicyContext,
  DetectionResult,
  PaymentEvent,
  PaymentTrace,
  PolicyDecisionEvent,
  BridgeScoring,
  EconomicRationalityCheck,
  ReplaySnapshot,
  PaymentProtocol,
  ScoredPath,
  InstrumentType,
  ExecutionResult,
  PaymentExecutor,
  TraceRecord,
  WalletConfig,
  PipelineStage,
  StageCompleteEvent,
  DiscoverOptions,
} from "./types.js";

export { resolveIdentity, createAgentSubdomain, findAgentSubdomains } from "./identity/index.js";
export type { AgentIdentity, IdentityConfig } from "./identity/index.js";

export {
  RhemifyError,
  DetectionError,
  PolicyBlockedError,
  BudgetExceededError,
  NoWalletError,
  ExecutionError,
} from "./errors.js";
