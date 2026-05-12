import { describe, it, expect } from "vitest";
import {
  detectFromResponse,
  executeWithCascade,
  SUPPORTED_PROTOCOLS,
  ProtocolNotImplementedError,
} from "../src/index.js";
import type { WalletConfig } from "../src/types.js";

const wallet: WalletConfig = {
  solanaPrivateKey:
    "[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64]",
};

const url = "https://example.com/paid";

function detect(headers: Record<string, string>) {
  return detectFromResponse(402, headers, null);
}

describe("SUPPORTED_PROTOCOLS export", () => {
  it("only lists protocols with real executors", () => {
    expect([...SUPPORTED_PROTOCOLS]).toEqual(["x402", "mpp"]);
  });

  it("does NOT include the unsupported-detection protocols", () => {
    expect((SUPPORTED_PROTOCOLS as readonly string[]).includes("l402")).toBe(false);
    expect((SUPPORTED_PROTOCOLS as readonly string[]).includes("ap2")).toBe(false);
    expect((SUPPORTED_PROTOCOLS as readonly string[]).includes("acp")).toBe(false);
  });
});

describe("L402 detected but not implemented", () => {
  it("detects L402 from WWW-Authenticate header", () => {
    const detection = detect({ "www-authenticate": 'L402 macaroon="abc", invoice="xyz"' });
    expect(detection.protocol).toBe("l402");
  });

  it("execute() throws ProtocolNotImplementedError with code", async () => {
    const detection = detect({ "www-authenticate": 'L402 macaroon="abc", invoice="xyz"' });

    let caught: unknown;
    try {
      await executeWithCascade(url, detection, wallet, {});
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ProtocolNotImplementedError);
    const e = caught as ProtocolNotImplementedError;
    expect(e.code).toBe("PROTOCOL_NOT_IMPLEMENTED");
    expect(e.protocol).toBe("l402");
    expect(e.network).toBe("lightning");
    expect(e.message).toContain("x402");
    expect(e.message).toContain("MPP");
  });
});

describe("AP2 detected but not implemented", () => {
  it("detects AP2 from X-AP2-Payment header", () => {
    const detection = detect({ "x-ap2-payment": "amount=0.01;recipient=0xabc" });
    expect(detection.protocol).toBe("ap2");
  });

  it("execute() throws ProtocolNotImplementedError", async () => {
    const detection = detect({ "x-ap2-payment": "amount=0.01;recipient=0xabc" });

    let caught: unknown;
    try {
      await executeWithCascade(url, detection, wallet, {});
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ProtocolNotImplementedError);
    expect((caught as ProtocolNotImplementedError).protocol).toBe("ap2");
  });
});

describe("ACP detected but not implemented", () => {
  it("detects ACP from X-ACP-Job header", () => {
    const detection = detect({ "x-acp-job": "job_123" });
    expect(detection.protocol).toBe("acp");
  });

  it("execute() throws ProtocolNotImplementedError on Base", async () => {
    const detection = detect({ "x-acp-job": "job_123" });

    let caught: unknown;
    try {
      await executeWithCascade(url, detection, wallet, {});
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ProtocolNotImplementedError);
    const e = caught as ProtocolNotImplementedError;
    expect(e.protocol).toBe("acp");
    expect(e.network).toBe("base");
  });
});
