import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import {
  IkaClient,
  IkaTransaction,
  getNetworkConfig,
  UserShareEncryptionKeys,
  type Curve,
  type DWallet,
  SignatureAlgorithm,
  Hash,
} from '@ika.xyz/sdk'

export interface IkaServiceConfig {
  network: 'testnet' | 'mainnet'
  suiSecretKey: string // base64 or hex Sui keypair for signing Ika txs
}

export interface DKGResult {
  dwalletId: string
  dwalletCapId: string
}

export interface SignResult {
  signatureId: string
}

export class IkaService {
  private ikaClient: IkaClient
  private suiClient: SuiJsonRpcClient
  private keypair: Ed25519Keypair
  private userShareEncryptionKeys?: UserShareEncryptionKeys

  constructor(config: IkaServiceConfig) {
    this.suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(config.network) })
    this.keypair = Ed25519Keypair.fromSecretKey(config.suiSecretKey)

    const ikaConfig = getNetworkConfig(config.network)
    this.ikaClient = new IkaClient({
      suiClient: this.suiClient,
      config: ikaConfig,
    })
  }

  async initialize(): Promise<void> {
    // Create user share encryption keys from the keypair seed
    const seed = this.keypair.getSecretKey()
    this.userShareEncryptionKeys = await UserShareEncryptionKeys.fromRootSeed(
      this.ikaClient,
      seed,
    )
    console.log('[ika-service] initialized with address:', this.keypair.toSuiAddress())
  }

  /**
   * Create a new dWallet via Distributed Key Generation.
   * Returns the dWallet ID and capability ID.
   */
  async createDWallet(curve: Curve = 'SECP256K1'): Promise<DKGResult> {
    if (!this.userShareEncryptionKeys) {
      throw new Error('Service not initialized — call initialize() first')
    }

    const tx = new Transaction()
    const ikaTx = new IkaTransaction({
      ikaClient: this.ikaClient,
      transaction: tx,
      userShareEncryptionKeys: this.userShareEncryptionKeys,
    })

    // Prepare DKG request input
    const dkgRequestInput = await this.userShareEncryptionKeys.prepareDKGRequestInput(
      this.ikaClient,
      curve,
    )

    // Get active encryption key
    const encryptionKey = await this.ikaClient.getActiveEncryptionKey()

    // Create session identifier
    const sessionIdentifier = ikaTx.createRandomSessionIdentifier()

    // Request DKG
    const result = await ikaTx.requestDWalletDKG({
      dkgRequestInput,
      ikaCoin: tx.gas,
      suiCoin: tx.gas,
      sessionIdentifier,
      dwalletNetworkEncryptionKeyId: encryptionKey.id,
      curve,
    })

    // Execute the transaction
    const response = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: tx,
    })

    // Wait for confirmation
    const confirmed = await this.suiClient.waitForTransaction({
      digest: response.digest,
      options: { showObjectChanges: true },
    })

    // Extract dWallet IDs from created objects
    const dwalletObj = confirmed.objectChanges?.find(
      (c) => c.type === 'created' && c.objectType?.includes('DWallet')
    )
    const capObj = confirmed.objectChanges?.find(
      (c) => c.type === 'created' && c.objectType?.includes('DWalletCap')
    )

    return {
      dwalletId: dwalletObj && 'objectId' in dwalletObj ? dwalletObj.objectId : response.digest,
      dwalletCapId: capObj && 'objectId' in capObj ? capObj.objectId : '',
    }
  }

  /**
   * Create a presign for a dWallet — needed before signing.
   */
  async createPresign(dwalletId: string): Promise<{ presignId: string }> {
    if (!this.userShareEncryptionKeys) {
      throw new Error('Service not initialized')
    }

    const dwallet = await this.ikaClient.getDWallet(dwalletId)
    if (!dwallet) throw new Error(`dWallet ${dwalletId} not found`)

    const tx = new Transaction()
    const ikaTx = new IkaTransaction({
      ikaClient: this.ikaClient,
      transaction: tx,
      userShareEncryptionKeys: this.userShareEncryptionKeys,
    })

    ikaTx.requestPresign({
      dWallet: dwallet,
      ikaCoin: tx.gas,
      suiCoin: tx.gas,
    })

    const response = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: tx,
    })

    return { presignId: response.digest }
  }

  /**
   * Sign a message using a dWallet's 2PC-MPC protocol.
   */
  async sign(params: {
    dwalletId: string
    message: Uint8Array
    presignId: string
  }): Promise<SignResult> {
    if (!this.userShareEncryptionKeys) {
      throw new Error('Service not initialized')
    }

    const dwallet = await this.ikaClient.getDWallet(params.dwalletId)
    if (!dwallet) throw new Error(`dWallet ${params.dwalletId} not found`)

    // Get the presign object
    const presign = await this.ikaClient.getPresign(params.presignId)
    if (!presign) throw new Error(`Presign ${params.presignId} not found`)

    // Get encrypted user secret key share
    const encryptedShare = await this.ikaClient.getEncryptedUserSecretKeyShare(dwallet)

    const tx = new Transaction()
    const ikaTx = new IkaTransaction({
      ikaClient: this.ikaClient,
      transaction: tx,
      userShareEncryptionKeys: this.userShareEncryptionKeys,
    })

    // Create message approval (required by Ika for signing authorization)
    const messageApproval = tx.moveCall({
      target: `${this.ikaClient.ikaConfig.packages.ikaDwallet2pcMpcPackage}::coordinator::approve_message`,
      arguments: [tx.pure.vector('u8', Array.from(params.message))],
    })

    const signatureId = await ikaTx.requestSign({
      dWallet: dwallet as any,
      messageApproval: messageApproval[0],
      hashScheme: Hash.KECCAK256,
      verifiedPresignCap: presign.id as any,
      presign: presign as any,
      encryptedUserSecretKeyShare: encryptedShare as any,
      message: params.message,
      signatureScheme: SignatureAlgorithm.Ecdsa,
      ikaCoin: tx.gas,
      suiCoin: tx.gas,
    })

    const response = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair,
      transaction: tx,
    })

    return { signatureId: response.digest }
  }

  /**
   * Fetch a dWallet's current state.
   */
  async getDWallet(dwalletId: string): Promise<DWallet | null> {
    return this.ikaClient.getDWallet(dwalletId)
  }

  /**
   * Fetch a completed signature.
   */
  async getSignature(signId: string): Promise<{ signature: Uint8Array | null; status: string }> {
    try {
      const sign = await this.ikaClient.getSign(signId)
      if (!sign) return { signature: null, status: 'not_found' }

      const state = sign.state
      if ('Active' in state) return { signature: null, status: 'pending' }
      if ('Completed' in state) {
        const sig = (state as any).Completed?.signature
        return { signature: sig ? Uint8Array.from(sig) : null, status: 'completed' }
      }
      return { signature: null, status: 'unknown' }
    } catch {
      return { signature: null, status: 'not_found' }
    }
  }
}
