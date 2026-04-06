package anchor

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	cx "github.com/rhemify/server/internal/convex"
)

const (
	// Batch when this many unbatched traces accumulate for a fleet+date
	BatchThreshold = 50

	// Batch when the last trace is older than this and there are unbatched traces
	InactivityTimeout = 30 * time.Minute
)

// BatchManager tracks unbatched trace counts per fleet+date and triggers
// Merkle batching when thresholds are reached.
type BatchManager struct {
	convex  *cx.Client
	mu      sync.Mutex
	pending map[string]*fleetDateState // key: "fleet_id:date"
}

type fleetDateState struct {
	fleetID    string
	date       string
	count      int
	lastTraceAt time.Time
}

func NewBatchManager(convex *cx.Client) *BatchManager {
	return &BatchManager{
		convex:  convex,
		pending: make(map[string]*fleetDateState),
	}
}

// OnTraceIngested is called after every successful trace ingest.
// It increments the count and checks both triggers.
func (bm *BatchManager) OnTraceIngested(fleetID string, traceHash string) {
	date := time.Now().UTC().Format("2006-01-02")
	key := fleetID + ":" + date

	bm.mu.Lock()
	state, exists := bm.pending[key]
	if !exists {
		state = &fleetDateState{
			fleetID: fleetID,
			date:    date,
		}
		bm.pending[key] = state
	}
	state.count++
	state.lastTraceAt = time.Now()
	shouldBatch := state.count >= BatchThreshold
	bm.mu.Unlock()

	// Trigger 1: count threshold
	if shouldBatch {
		go bm.executeBatch(fleetID, date)
	}

	// Trigger 2: inactivity flush for OTHER fleet+dates
	go bm.checkInactiveFleets()
}

// checkInactiveFleets finds fleet+dates with unbatched traces older than InactivityTimeout.
func (bm *BatchManager) checkInactiveFleets() {
	bm.mu.Lock()
	var staleKeys []string
	now := time.Now()

	for key, state := range bm.pending {
		if state.count > 0 && now.Sub(state.lastTraceAt) > InactivityTimeout {
			staleKeys = append(staleKeys, key)
		}
	}
	bm.mu.Unlock()

	for _, key := range staleKeys {
		bm.mu.Lock()
		state, exists := bm.pending[key]
		if !exists || state.count == 0 {
			bm.mu.Unlock()
			continue
		}
		fleetID := state.fleetID
		date := state.date
		bm.mu.Unlock()

		bm.executeBatch(fleetID, date)
	}
}

// executeBatch builds a Merkle tree from all unbatched traces for a fleet+date
// and stores the result in Convex.
func (bm *BatchManager) executeBatch(fleetID, date string) {
	// Reset the pending count first to avoid re-triggering
	key := fleetID + ":" + date
	bm.mu.Lock()
	if state, exists := bm.pending[key]; exists {
		state.count = 0
	}
	bm.mu.Unlock()

	// Fetch all trace hashes for this fleet+date from Convex
	hashes, err := bm.fetchTraceHashes(fleetID, date)
	if err != nil {
		log.Printf("[anchor] failed to fetch trace hashes for %s/%s: %v", fleetID, date, err)
		return
	}

	if len(hashes) == 0 {
		return
	}

	// Build Merkle tree
	tree, err := BuildMerkleTree(hashes)
	if err != nil {
		log.Printf("[anchor] failed to build Merkle tree for %s/%s: %v", fleetID, date, err)
		return
	}

	log.Printf("[anchor] built Merkle tree for %s/%s: %d traces, root=%s",
		fleetID, date, len(hashes), tree.RootHex())

	// Store batch in Convex (status: "pending" until PDA is written)
	proofs := make(map[string][]string)
	for i, h := range hashes {
		proof, err := tree.GetProofHex(i)
		if err == nil {
			proofs[h] = proof
		}
	}

	proofsJSON, _ := json.Marshal(proofs)

	_, err = bm.convex.Mutation("anchors:upsertBatch", map[string]interface{}{
		"fleet_id":    fleetID,
		"date":        date,
		"merkle_root": tree.RootHex(),
		"trace_count": float64(len(hashes)),
		"status":      "pending",
		"tree_data":   json.RawMessage(proofsJSON),
	})
	if err != nil {
		log.Printf("[anchor] failed to store batch for %s/%s: %v", fleetID, date, err)
		return
	}

	// Update individual trace proofs
	for hash, proof := range proofs {
		proofJSON, _ := json.Marshal(proof)
		// Find trace by hash and update — we need trace_id, so fetch from Convex
		bm.convex.Mutation("anchors:updateTraceProofByHash", map[string]interface{}{
			"trace_hash":   hash,
			"merkle_proof": json.RawMessage(proofJSON),
		})
	}

	log.Printf("[anchor] batch stored for %s/%s: %d traces, root=%s",
		fleetID, date, len(hashes), tree.RootHex())

	// TODO: Write root to Solana PDA via Anchor program
	// This requires the authority keypair + Solana RPC client
	// For hackathon: batch is stored in Convex, PDA write is stretch goal
}

// fetchTraceHashes gets all trace hashes for a fleet+date that don't have a merkle_proof yet.
func (bm *BatchManager) fetchTraceHashes(fleetID, date string) ([]string, error) {
	result, err := bm.convex.Query("anchors:getUnbatchedHashes", map[string]interface{}{
		"fleet_id": fleetID,
		"date":     date,
	})
	if err != nil {
		return nil, err
	}

	var hashes []string
	if err := json.Unmarshal(result, &hashes); err != nil {
		return nil, err
	}

	return hashes, nil
}
