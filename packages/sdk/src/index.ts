export { createRhemos } from "./client.js";
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
  Rhemos,
  RhemosConfig,
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
  PaymentProtocol,
  ScoredPath,
  InstrumentType,
  ExecutionResult,
  PaymentExecutor,
  TraceRecord,
  WalletConfig,
} from "./types.js";

export {
  RhemosError,
  DetectionError,
  PolicyBlockedError,
  BudgetExceededError,
  NoWalletError,
  ExecutionError,
} from "./errors.js";
