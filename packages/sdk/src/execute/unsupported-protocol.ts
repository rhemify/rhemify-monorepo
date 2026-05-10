/**
 * Executor that owns a protocol the SDK can DETECT but cannot yet EXECUTE.
 *
 * Why this exists (audit #10): the SDK has stub detectors for L402, AP2,
 * and ACP that recognize challenge headers but don't parse full challenge
 * details, and there are no real payment flows to execute against them.
 * Without these stub executors, `pay()` against an L402-protected URL
 * would throw a generic `ExecutionError("No executor available for l402
 * on lightning")`. Callers can't distinguish that from a transient failure.
 *
 * With these stub executors registered, the cascade picks them up
 * (canExecute returns true for the matching protocol) and `execute()`
 * throws `ProtocolNotImplementedError` — a typed, structured error with a
 * dedicated `code` callers can switch on, plus the protocol + network so
 * UIs can render "this server uses L402, which we don't support yet."
 *
 * When real executors land, replace these by the matching real executor
 * in execute/index.ts and the typed error path naturally goes away.
 */
import type { PaymentProtocol } from "../types.js";
import { ProtocolNotImplementedError } from "../errors.js";
import type { PaymentExecutor } from "./types.js";

export function unsupportedProtocolExecutor(protocol: PaymentProtocol): PaymentExecutor {
  return {
    protocol,
    networks: ["*"],
    canExecute(detection) {
      return detection.protocol === protocol;
    },
    async execute(_url, detection) {
      throw new ProtocolNotImplementedError(detection.protocol, detection.network ?? "unknown");
    },
  };
}

export const l402UnsupportedExecutor = unsupportedProtocolExecutor("l402");
export const ap2UnsupportedExecutor = unsupportedProtocolExecutor("ap2");
export const acpUnsupportedExecutor = unsupportedProtocolExecutor("acp");
