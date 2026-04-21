// Seed script — generates realistic demo data by calling POST /api/ingest/payment.
// Exercises the full pipeline: event storage, aggregates, rules engine, intelligence actions.
//
// Usage:
//   go run ./cmd/seed                           # defaults: http://localhost:8080, 100 events
//   go run ./cmd/seed -url http://localhost:8080 -n 100
//   go run ./cmd/seed -scenario failing-vendor  # trigger VH-1 auto-block
//   go run ./cmd/seed -scenario all             # run all scenarios
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"time"
)

var (
	baseURL  = flag.String("url", "http://localhost:8080", "Go server URL")
	apiKey   = flag.String("key", "demo-fleet-key", "Fleet API key")
	count    = flag.Int("n", 100, "Number of events to generate (for 'mixed' scenario)")
	scenario = flag.String("scenario", "all", "Scenario: mixed, failing-vendor, micropayments, bridge-heavy, spend-spike, all")
)

// Demo fleet and agents
const (
	fleetID  = "fleet_demo_001"
	agent1   = "agent_research_01"
	agent2   = "agent_trading_02"
	agent3   = "agent_data_03"
	agent4   = "agent_ops_04"
)

var agents = []string{agent1, agent2, agent3, agent4}

var vendors = []struct {
	domain   string
	standard string
}{
	{"api.bloomberg.com", "x402"},
	{"api.reuters.com", "x402"},
	{"data.alphakit.io", "mpp"},
	{"api.coingecko.com", "x402"},
	{"oracle.chainlink.io", "l402"},
	{"compute.akash.network", "x402"},
	{"storage.arweave.net", "x402"},
	{"api.openai.com", "mpp"},
}

func main() {
	flag.Parse()
	rand.New(rand.NewSource(time.Now().UnixNano()))

	log.Printf("Seeding %s (scenario: %s)", *baseURL, *scenario)

	switch *scenario {
	case "mixed":
		seedMixed(*count)
	case "failing-vendor":
		seedFailingVendor()
	case "micropayments":
		seedMicropayments()
	case "bridge-heavy":
		seedBridgeHeavy()
	case "spend-spike":
		seedSpendSpike()
	case "all":
		seedFailingVendor()
		seedMicropayments()
		seedBridgeHeavy()
		seedSpendSpike()
		seedMixed(*count)
	default:
		log.Fatalf("unknown scenario: %s", *scenario)
	}

	log.Println("Done!")
}

// seedMixed generates a realistic mix of successful and failed payments across all agents/vendors.
func seedMixed(n int) {
	log.Printf("  [mixed] Generating %d mixed events...", n)
	for i := 0; i < n; i++ {
		agent := agents[rand.Intn(len(agents))]
		v := vendors[rand.Intn(len(vendors))]
		amount := 0.10 + rand.Float64()*5.0 // $0.10 - $5.10
		outcome := "success"
		if rand.Float64() < 0.08 { // 8% failure rate
			outcome = "failed"
		}

		ingest(agent, v.domain, v.standard, amount, outcome, "solana", "direct", nil)
		time.Sleep(50 * time.Millisecond) // pace requests
	}
}

// seedFailingVendor sends 15 events to a vendor with 60% failure rate → triggers VH-1 auto-block.
func seedFailingVendor() {
	log.Println("  [failing-vendor] Triggering VH-1 auto-block for oracle.chainlink.io...")
	for i := 0; i < 15; i++ {
		outcome := "failed"
		if i%5 == 0 { // 20% success (below 50% threshold)
			outcome = "success"
		}
		ingest(agent1, "oracle.chainlink.io", "l402", 0.50, outcome, "solana", "direct", nil)
		time.Sleep(30 * time.Millisecond)
	}
}

// seedMicropayments sends 30 small payments from agent2 to bloomberg → triggers SUB-1 subscription recommendation.
func seedMicropayments() {
	log.Println("  [micropayments] Triggering SUB-1 for agent_trading_02 → api.bloomberg.com...")
	for i := 0; i < 30; i++ {
		amount := 0.40 + rand.Float64()*0.20 // $0.40 - $0.60
		ingest(agent2, "api.bloomberg.com", "x402", amount, "success", "solana", "direct", nil)
		time.Sleep(30 * time.Millisecond)
	}
}

// seedBridgeHeavy sends bridge payments with high fees → triggers RO-1 bridge warning.
func seedBridgeHeavy() {
	log.Println("  [bridge-heavy] Triggering RO-1 bridge warnings...")
	bridges := []struct {
		from, to, protocol string
		costPct            float64
	}{
		{"ethereum", "solana", "cctp", 25.0},
		{"base", "solana", "cctp", 30.0},
		{"arbitrum", "solana", "wormhole", 22.0},
	}
	for _, b := range bridges {
		amount := 5.0 + rand.Float64()*10.0
		bridgeInfo := map[string]interface{}{
			"bridge_cost_pct": b.costPct,
		}
		ingest(agent3, "compute.akash.network", "x402", amount, "success", b.from, "cctp", bridgeInfo)
		time.Sleep(50 * time.Millisecond)
	}
}

// seedSpendSpike sends a burst of high-value payments → triggers SA-1 agent anomaly + SA-3 fleet spike.
func seedSpendSpike() {
	log.Println("  [spend-spike] Building baseline then triggering SA-1/SA-3...")

	// First: build a baseline with 10 normal payments over several "days"
	for i := 0; i < 10; i++ {
		ingest(agent4, "api.openai.com", "mpp", 2.0+rand.Float64()*3.0, "success", "solana", "direct", nil)
		time.Sleep(30 * time.Millisecond)
	}

	// Then: spike with 5 large payments
	for i := 0; i < 5; i++ {
		ingest(agent4, "api.openai.com", "mpp", 50.0+rand.Float64()*100.0, "success", "solana", "direct", nil)
		time.Sleep(30 * time.Millisecond)
	}
}

// ingest sends one payment event through the full pipeline.
func ingest(agentID, domain, standard string, amount float64, outcome, chain, instrumentType string, bridgeInfo map[string]interface{}) {
	hash := sha256.Sum256([]byte(fmt.Sprintf("%s-%s-%d", agentID, domain, time.Now().UnixNano())))
	traceID := fmt.Sprintf("trc_%x", hash[:8])

	trace := map[string]interface{}{
		"id":                       traceID,
		"agent_task_context":       fmt.Sprintf("Payment to %s by %s", domain, agentID),
		"trigger_402_raw":          fmt.Sprintf("HTTP 402 from %s", domain),
		"alternatives_evaluated":   []interface{}{},
		"policy_rules_fired":       []interface{}{},
		"instrument_selection_log": []interface{}{},
		"confidence":               "high",
		"trace_hash":               fmt.Sprintf("%x", sha256.Sum256([]byte(traceID))),
		"replay_snapshot": map[string]interface{}{
			"policy_state": map[string]interface{}{
				"daily_limit":         500.0,
				"max_per_transaction": 100.0,
				"approval_threshold":  50.0,
				"allowed_standards":   []string{"x402", "mpp", "l402", "ap2", "acp"},
				"domain_allowlist":    []string{},
			},
			"vendor_registry_snapshot": map[string]interface{}{
				domain: map[string]interface{}{
					"is_blocked":   false,
					"success_rate": 0.95,
				},
			},
			"agent_context": map[string]interface{}{
				"spend_today": rand.Float64() * 100,
				"agent_id":    agentID,
			},
		},
	}

	// Add bridge info to trace if present
	if bridgeInfo != nil {
		trace["economic_rationality_check"] = bridgeInfo
	}

	event := map[string]interface{}{
		"agent_id":        agentID,
		"fleet_id":        fleetID,
		"standard":        standard,
		"amount":          amount,
		"token":           "USDC",
		"chain":           chain,
		"domain":          domain,
		"outcome":         outcome,
		"instrument_type": instrumentType,
		"trace_id":        traceID,
	}

	if bridgeInfo != nil {
		event["chain_from"] = chain
		event["chain_to"] = "solana"
	}

	payload := map[string]interface{}{
		"event":           event,
		"trace":           trace,
		"policyDecisions": []interface{}{},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", *baseURL+"/api/ingest/payment", bytes.NewReader(body))
	if err != nil {
		log.Printf("    ERROR creating request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+*apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("    ERROR: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		var errBody map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errBody)
		log.Printf("    ERROR %d: %v", resp.StatusCode, errBody)
		return
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	log.Printf("    ✓ %s → %s $%.2f [%s] → %v", agentID, domain, amount, outcome, result["eventId"])
}
