/**
 * Test x402 + MPP server for local development.
 * Returns proper HTTP 402 responses so the SDK can detect and attempt payment.
 *
 * Endpoints:
 *   GET /stock-data   → x402 on Solana devnet ($0.50 USDC)
 *   GET /weather       → x402 on Base Sepolia ($0.25 USDC)
 *   GET /analytics     → MPP on Solana devnet ($0.10 USDC)
 *   GET /health        → 200 OK (no payment required)
 *
 * Usage: bun run server.ts
 */

const PORT = Number(process.env.PORT ?? 3402);

// Replace with your own devnet recipient address (Solana base58 for
// the Solana endpoints).
const SOLANA_RECIPIENT = process.env.RECIPIENT_ADDRESS ?? "11111111111111111111111111111111";

// EVM side: configurable network + recipient for /weather. Defaults match
// the original demo (Base Sepolia + 0x...0001 placeholder). When the
// payer wants to use Ethereum Sepolia instead (because they have Sepolia
// ETH but not Base Sepolia ETH — separate chains), set
// EVM_NETWORK=ethereum-sepolia and EVM_RECIPIENT=<their 0x address>.
const EVM_NETWORK = process.env.EVM_NETWORK ?? "base-sepolia";
const EVM_RECIPIENT =
  process.env.EVM_RECIPIENT ?? "0x0000000000000000000000000000000000000001";

const server = Bun.serve({
  port: PORT,

  fetch(req) {
    const url = new URL(req.url);
    const paymentHeader = req.headers.get("x-payment") ?? req.headers.get("authorization");

    // If a payment credential is provided, simulate successful payment
    if (paymentHeader && url.pathname !== "/health") {
      return Response.json(
        {
          data: getResponseData(url.pathname),
          paid: true,
          timestamp: new Date().toISOString(),
        },
        {
          status: 200,
          headers: {
            "x-payment-receipt": `receipt_${Date.now().toString(36)}`,
          },
        },
      );
    }

    switch (url.pathname) {
      case "/health":
        return Response.json({
          status: "ok",
          endpoints: ["/stock-data", "/weather", "/analytics"],
        });

      case "/stock-data":
        return Response.json(
          {
            accepts: [
              {
                scheme: "exact",
                network: "solana-devnet",
                maxAmountRequired: "500000",
                resource: `http://localhost:${PORT}/stock-data`,
                payTo: SOLANA_RECIPIENT,
                extra: { name: "USDC" },
              },
            ],
          },
          {
            status: 402,
            headers: { "content-type": "application/json" },
          },
        );

      case "/weather":
        return Response.json(
          {
            paymentRequirements: [
              {
                scheme: "exact",
                network: EVM_NETWORK,
                maxAmountRequired: "250000",
                resource: `http://localhost:${PORT}/weather`,
                payTo: EVM_RECIPIENT,
                extra: { name: "USDC" },
              },
            ],
          },
          {
            status: 402,
            headers: { "content-type": "application/json" },
          },
        );

      case "/analytics":
        return new Response(
          JSON.stringify({
            amount: "100000",
            currency: "USDC",
            recipient: SOLANA_RECIPIENT,
            description: "Analytics API access",
            methodDetails: {
              network: "solana-devnet",
              decimals: 6,
            },
          }),
          {
            status: 402,
            headers: {
              "content-type": "application/json",
              "www-authenticate": `Payment scheme="solana" amount="100000" currency="USDC" recipient="${SOLANA_RECIPIENT}" network="solana-devnet"`,
            },
          },
        );

      default:
        return Response.json({ error: "not found" }, { status: 404 });
    }
  },
});

function getResponseData(pathname: string): unknown {
  switch (pathname) {
    case "/stock-data":
      return {
        symbol: "AAPL",
        price: 198.52,
        change: 2.31,
        volume: 48_200_000,
        timestamp: new Date().toISOString(),
      };
    case "/weather":
      return {
        location: "San Francisco",
        temp_f: 68,
        conditions: "Partly cloudy",
        humidity: 72,
      };
    case "/analytics":
      return {
        visitors: 12_450,
        pageviews: 34_200,
        bounce_rate: 0.42,
        avg_session: "3m 12s",
      };
    default:
      return { message: "paid content" };
  }
}

console.log(`Test 402 server running on http://localhost:${PORT}`);
console.log(`  GET /stock-data   → x402 Solana devnet ($0.50)`);
console.log(`  GET /weather      → x402 Base Sepolia ($0.25)`);
console.log(`  GET /analytics    → MPP Solana devnet ($0.10)`);
console.log(`  GET /health       → 200 OK`);
