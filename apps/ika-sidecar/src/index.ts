import { Hono } from 'hono'
import { IkaService } from './ika-service'

const app = new Hono()

const network = (process.env.IKA_NETWORK as 'testnet' | 'mainnet') || 'testnet'
const suiSecretKey = process.env.SUI_SECRET_KEY || ''
const port = parseInt(process.env.IKA_SIDECAR_PORT || '3002', 10)
const sidecarSecret = process.env.IKA_SIDECAR_SECRET || ''

let ikaService: IkaService | null = null

// Auth middleware — require shared secret on all endpoints except /health
app.use('*', async (c, next) => {
  if (c.req.path === '/health') return next()
  if (!sidecarSecret) {
    return c.json({ error: 'IKA_SIDECAR_SECRET not configured' }, 503)
  }
  const auth = c.req.header('Authorization')
  if (auth !== `Bearer ${sidecarSecret}`) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  return next()
})

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', initialized: ikaService !== null, network })
})

// Create a dWallet via DKG
app.post('/dkg', async (c) => {
  if (!ikaService) return c.json({ error: 'service not initialized' }, 503)

  try {
    const body = await c.req.json<{ curve?: string }>().catch(() => ({}))
    const result = await ikaService.createDWallet(body.curve as any)
    return c.json(result)
  } catch (err: any) {
    console.error('[/dkg] error:', err)
    return c.json({ error: 'DKG failed' }, 500)
  }
})

// Create a presign for a dWallet
app.post('/presign', async (c) => {
  if (!ikaService) return c.json({ error: 'service not initialized' }, 503)

  try {
    const { dwallet_id } = await c.req.json<{ dwallet_id: string }>()
    if (!dwallet_id) return c.json({ error: 'dwallet_id required' }, 400)

    const result = await ikaService.createPresign(dwallet_id)
    return c.json(result)
  } catch (err: any) {
    console.error('[/presign] error:', err)
    return c.json({ error: 'presign failed' }, 500)
  }
})

// Sign a message using 2PC-MPC
app.post('/sign', async (c) => {
  if (!ikaService) return c.json({ error: 'service not initialized' }, 503)

  try {
    const { dwallet_id, message_hex, presign_id } = await c.req.json<{
      dwallet_id: string
      message_hex: string
      presign_id: string
    }>()

    if (!dwallet_id || !message_hex || !presign_id) {
      return c.json({ error: 'dwallet_id, message_hex, and presign_id required' }, 400)
    }

    const message = Uint8Array.from(Buffer.from(message_hex, 'hex'))
    const result = await ikaService.sign({ dwalletId: dwallet_id, message, presignId: presign_id })
    return c.json(result)
  } catch (err: any) {
    console.error('[/sign] error:', err)
    return c.json({ error: 'signing failed' }, 500)
  }
})

// Get dWallet info
app.get('/dwallet/:id', async (c) => {
  if (!ikaService) return c.json({ error: 'service not initialized' }, 503)

  try {
    const dwallet = await ikaService.getDWallet(c.req.param('id'))
    if (!dwallet) return c.json({ error: 'not found' }, 404)
    return c.json(dwallet)
  } catch (err: any) {
    return c.json({ error: 'fetch failed' }, 500)
  }
})

// Get signature status
app.get('/signature/:id', async (c) => {
  if (!ikaService) return c.json({ error: 'service not initialized' }, 503)

  try {
    const result = await ikaService.getSignature(c.req.param('id'))
    return c.json({
      status: result.status,
      signature_hex: result.signature ? Buffer.from(result.signature).toString('hex') : null,
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// SNS Identity: Resolve .sol domain to owner
app.get('/identity/resolve/:domain', async (c) => {
  try {
    const { resolve } = await import('@bonfida/spl-name-service')
    const { Connection, clusterApiUrl } = await import('@solana/web3.js')
    const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'))

    const domain = c.req.param('domain').replace(/\.sol$/, '')
    const owner = await resolve(connection, domain)

    const parts = domain.split('.')
    const isSubdomain = parts.length >= 2

    return c.json({
      domain: domain + '.sol',
      parentDomain: isSubdomain ? parts.slice(1).join('.') + '.sol' : domain + '.sol',
      agentKey: isSubdomain ? parts[0] : null,
      owner: owner.toBase58(),
    })
  } catch (err: any) {
    return c.json({ error: 'domain not found' }, 404)
  }
})

// SNS Identity: List agent subdomains under a fleet domain
app.get('/identity/subdomains/:domain', async (c) => {
  try {
    const { findSubdomains, resolve, getDomainKeySync } = await import('@bonfida/spl-name-service')
    const { Connection, clusterApiUrl } = await import('@solana/web3.js')
    const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'))

    const domain = c.req.param('domain').replace(/\.sol$/, '')
    const { pubkey } = getDomainKeySync(domain)
    const subdomains = await findSubdomains(connection, pubkey)

    const agents = []
    for (const sub of subdomains) {
      try {
        const owner = await resolve(connection, `${sub}.${domain}`)
        agents.push({
          domain: `${sub}.${domain}.sol`,
          agentKey: sub,
          owner: owner.toBase58(),
        })
      } catch {
        // Skip unresolvable subdomains
      }
    }

    return c.json({ parentDomain: domain + '.sol', agents })
  } catch (err: any) {
    return c.json({ error: 'failed to list subdomains' }, 500)
  }
})

// SNS Identity: Register agent subdomain
app.post('/identity/register', async (c) => {
  try {
    const { createSubdomain } = await import('@bonfida/spl-name-service')
    const { Connection, PublicKey, clusterApiUrl } = await import('@solana/web3.js')
    const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'))

    const { parent_domain, agent_key, owner_pubkey } = await c.req.json<{
      parent_domain: string
      agent_key: string
      owner_pubkey: string
    }>()

    if (!parent_domain || !agent_key || !owner_pubkey) {
      return c.json({ error: 'parent_domain, agent_key, and owner_pubkey required' }, 400)
    }

    const subdomain = `${agent_key}.${parent_domain}`
    const owner = new PublicKey(owner_pubkey)
    const instructions = await createSubdomain(connection, subdomain, owner, 1_000)

    return c.json({
      subdomain: subdomain + '.sol',
      instructions_count: instructions.length,
      status: 'instructions_ready',
    })
  } catch (err: any) {
    console.error('[/identity/register] error:', err)
    return c.json({ error: 'subdomain registration failed' }, 500)
  }
})

// Initialize and start
async function main() {
  if (!suiSecretKey) {
    console.warn('[ika-sidecar] SUI_SECRET_KEY not set — running in mock mode')
  } else {
    try {
      ikaService = new IkaService({ network, suiSecretKey })
      await ikaService.initialize()
      console.log(`[ika-sidecar] Ika service initialized on ${network}`)
    } catch (err) {
      console.error('[ika-sidecar] Failed to initialize Ika service:', err)
      console.warn('[ika-sidecar] Running without Ika — endpoints will return 503')
    }
  }

  console.log(`[ika-sidecar] listening on :${port}`)
  Bun.serve({ fetch: app.fetch, port })
}

main()
