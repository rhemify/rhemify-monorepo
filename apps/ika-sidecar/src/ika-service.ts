import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import {
  IkaClient,
  IkaTransaction,
  getNetworkConfig,
  UserShareEncryptionKeys,
  prepareDKG,
  type Curve,
  type DWallet,
  type ZeroTrustDWallet,
  type SharedDWallet,
  SignatureAlgorithm,
  Hash,
} from "@ika.xyz/sdk";

export interface IkaServiceConfig {
  network: "testnet" | "mainnet";
  /** Sui keypair private key — accepts the suiprivkey1... bech32 string from `sui keytool export`. */
  suiSecretKey: string;
}

export interface DKGResult {
  dwalletId: string;
  dwalletCapId: string;
}

export interface SignResult {
  signatureId: string;
}

export class IkaService {
  private ikaClient: IkaClient;
  private suiClient: SuiJsonRpcClient;
  private keypair: Ed25519Keypair;
  private userShareEncryptionKeys?: UserShareEncryptionKeys;

  constructor(config: IkaServiceConfig) {
    // SuiJsonRpcClient 2.16 requires both url and network in options.
    this.suiClient = new SuiJsonRpcClient({
      url: getJsonRpcFullnodeUrl(config.network),
      network: config.network,
    });
    this.keypair = Ed25519Keypair.fromSecretKey(config.suiSecretKey);

    const ikaConfig = getNetworkConfig(config.network);
    this.ikaClient = new IkaClient({
      suiClient: this.suiClient,
      config: ikaConfig,
    });
  }

  async initialize(): Promise<void> {
    // 0.3.1: fromRootSeedKey takes (Uint8Array seed, Curve), not (ikaClient, seed).
    // Ed25519Keypair.getSecretKey() returns the suiprivkey1... bech32 string;
    // decodeSuiPrivateKey peels it back to raw Uint8Array bytes.
    const seedString = this.keypair.getSecretKey();
    const { secretKey: seedBytes } = decodeSuiPrivateKey(seedString);
    this.userShareEncryptionKeys = await UserShareEncryptionKeys.fromRootSeedKey(
      seedBytes,
      "SECP256K1",
    );
    console.log("[ika-service] initialized with address:", this.keypair.toSuiAddress());
  }

  /**
   * Create a new dWallet via Distributed Key Generation.
   *
   * 0.3.1 changes vs the previous version:
   *   - prepareDKGRequestInput moved off UserShareEncryptionKeys into the
   *     free function `prepareDKG(protocolPublicParameters, curve,
   *     encryptionKey, bytesToHash, senderAddress)`.
   *   - getActiveEncryptionKey now requires a Sui address argument.
   *   - createRandomSessionIdentifier renamed to createSessionIdentifier;
   *     we use registerSessionIdentifier(bytesToHash) so the session id
   *     matches the bytes consumed by prepareDKG.
   */
  async createDWallet(curve: Curve = "SECP256K1"): Promise<DKGResult> {
    if (!this.userShareEncryptionKeys) {
      throw new Error("Service not initialized — call initialize() first");
    }

    const senderAddress = this.keypair.toSuiAddress();
    const protocolPublicParameters = await this.ikaClient.getProtocolPublicParameters(
      undefined,
      curve,
    );
    const encryptionKey = await this.ikaClient.getActiveEncryptionKey(senderAddress);

    // Session bytes shared between prepareDKG (for proof binding) and the
    // session identifier on-chain. 32 random bytes is the documented size.
    const sessionBytes = crypto.getRandomValues(new Uint8Array(32));

    const dkgRequestInput = await prepareDKG(
      protocolPublicParameters,
      curve,
      this.userShareEncryptionKeys.encryptionKey,
      sessionBytes,
      senderAddress,
    );

    const tx = new Transaction();
    const ikaTx = new IkaTransaction({
      ikaClient: this.ikaClient,
      transaction: tx,
      userShareEncryptionKeys: this.userShareEncryptionKeys,
    });

    const sessionIdentifier = ikaTx.registerSessionIdentifier(sessionBytes);

    await ikaTx.requestDWalletDKG({
      dkgRequestInput,
      ikaCoin: tx.gas,
      suiCoin: tx.gas,
      sessionIdentifier,
      dwalletNetworkEncryptionKeyId: encryptionKey.id,
      curve,
    });

    const response = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: tx,
    });

    const confirmed = await this.suiClient.waitForTransaction({
      digest: response.digest,
      options: { showObjectChanges: true },
    });

    const dwalletObj = confirmed.objectChanges?.find(
      (c) => c.type === "created" && c.objectType?.includes("DWallet"),
    );
    const capObj = confirmed.objectChanges?.find(
      (c) => c.type === "created" && c.objectType?.includes("DWalletCap"),
    );

    return {
      dwalletId: dwalletObj && "objectId" in dwalletObj ? dwalletObj.objectId : response.digest,
      dwalletCapId: capObj && "objectId" in capObj ? capObj.objectId : "",
    };
  }

  /**
   * Create a presign for a dWallet — needed before signing.
   *
   * 0.3.1: requestPresign now requires `signatureAlgorithm`. Hard-coding
   * ECDSASecp256k1 since that's what we've been using; expose as a param
   * if the sidecar grows multi-algorithm support.
   */
  async createPresign(dwalletId: string): Promise<{ presignId: string }> {
    if (!this.userShareEncryptionKeys) {
      throw new Error("Service not initialized");
    }

    const dwallet = await this.ikaClient.getDWallet(dwalletId);
    if (!dwallet) throw new Error(`dWallet ${dwalletId} not found`);

    const tx = new Transaction();
    const ikaTx = new IkaTransaction({
      ikaClient: this.ikaClient,
      transaction: tx,
      userShareEncryptionKeys: this.userShareEncryptionKeys,
    });

    ikaTx.requestPresign({
      dWallet: dwallet,
      signatureAlgorithm: SignatureAlgorithm.ECDSASecp256k1,
      ikaCoin: tx.gas,
      suiCoin: tx.gas,
    });

    const response = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: tx,
    });

    return { presignId: response.digest };
  }

  /**
   * Sign a message using a dWallet's 2PC-MPC protocol.
   *
   * 0.3.1 unverified surface: requestSign now requires the dWallet to be
   * `ZeroTrustDWallet | SharedDWallet` (not the generic DWallet union),
   * and getEncryptedUserSecretKeyShare takes the share-ID string rather
   * than the dWallet object. Without an Ika test network to round-trip
   * the signing flow against, this method throws explicitly so callers
   * see the gap rather than getting opaque runtime errors.
   *
   * TODO(ika-sign): once Ika test network access is available:
   *   1. Read DWallet.encryptedUserSecretKeyShareID (or whatever field
   *      holds the EncryptedUserSecretKeyShare object id).
   *   2. Pass that ID string into ikaClient.getEncryptedUserSecretKeyShare.
   *   3. Narrow `dwallet` to ZeroTrustDWallet | SharedDWallet (or branch
   *      to requestSignWithImportedKey for ImportedKey/ImportedShared).
   *   4. Pass SignatureAlgorithm.ECDSASecp256k1 as signatureScheme.
   *   5. Verify with a real /sign request that returns a non-null
   *      signature via getSign(signId, curve, signatureAlgorithm).
   */
  async sign(params: {
    dwalletId: string;
    message: Uint8Array;
    presignId: string;
  }): Promise<SignResult> {
    void params;
    if (!this.userShareEncryptionKeys) {
      throw new Error("Service not initialized");
    }
    throw new Error(
      "IkaService.sign: not implemented for @ika.xyz/sdk 0.3.1. The signing " +
        "flow has structural API changes (encrypted-share id lookup, dWallet " +
        "type narrowing, requestSign signature) that require live Ika network " +
        "access to verify. See TODO(ika-sign) in this file for the unblocking " +
        "checklist.",
    );
  }

  /** Fetch a dWallet's current state. */
  async getDWallet(dwalletId: string): Promise<DWallet | null> {
    return this.ikaClient.getDWallet(dwalletId);
  }

  /**
   * Fetch a completed signature.
   *
   * 0.3.1: getSign requires (signID, curve, signatureAlgorithm) — three
   * args instead of one. Defaults match the createPresign / sign flow
   * above; widen if the sidecar adds multi-curve / multi-algorithm.
   */
  async getSignature(
    signId: string,
    curve: Curve = "SECP256K1",
  ): Promise<{ signature: Uint8Array | null; status: string }> {
    try {
      const sign = await this.ikaClient.getSign(
        signId,
        curve,
        SignatureAlgorithm.ECDSASecp256k1,
      );
      if (!sign) return { signature: null, status: "not_found" };

      const state = sign.state;
      if ("Active" in state) return { signature: null, status: "pending" };
      if ("Completed" in state) {
        const sig = (state as any).Completed?.signature;
        return { signature: sig ? Uint8Array.from(sig) : null, status: "completed" };
      }
      return { signature: null, status: "unknown" };
    } catch {
      return { signature: null, status: "not_found" };
    }
  }
}
