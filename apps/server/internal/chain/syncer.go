package chain

import (
	"context"
	"encoding/json"
	"log"
	"time"

	cx "github.com/rhemify/server/internal/convex"
)

// BalanceSyncer periodically fetches cross-chain balances and upserts to Convex.
type BalanceSyncer struct {
	registry *ChainRegistry
	convex   *cx.Client
	interval time.Duration
}

func NewBalanceSyncer(registry *ChainRegistry, convex *cx.Client, interval time.Duration) *BalanceSyncer {
	return &BalanceSyncer{
		registry: registry,
		convex:   convex,
		interval: interval,
	}
}

// Start runs the syncer in a loop until ctx is cancelled.
func (s *BalanceSyncer) Start(ctx context.Context) {
	log.Printf("[syncer] starting balance syncer (interval: %s)", s.interval)
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	// Run immediately on start
	s.sync(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("[syncer] shutting down")
			return
		case <-ticker.C:
			s.sync(ctx)
		}
	}
}

func (s *BalanceSyncer) sync(ctx context.Context) {
	// Fetch active dWallets from Convex
	// For now we query all fleets — in production this would be scoped
	result, err := s.convex.Query("dwallets:listByFleet", map[string]interface{}{
		"fleet_id": "", // empty = all (would need a listActive query in practice)
	})
	if err != nil {
		log.Printf("[syncer] failed to fetch dWallets: %v", err)
		return
	}

	var wallets []struct {
		DWalletID       string   `json:"dwallet_id"`
		SupportedChains []string `json:"supported_chains"`
		Status          string   `json:"status"`
	}
	if err := json.Unmarshal(result, &wallets); err != nil {
		log.Printf("[syncer] failed to parse dWallets: %v", err)
		return
	}

	synced := 0
	for _, w := range wallets {
		if w.Status != "active" {
			continue
		}
		for _, chainName := range w.SupportedChains {
			adapter, err := s.registry.Get(chainName)
			if err != nil {
				continue // chain not supported yet
			}

			// Sync ETH balance
			balance, err := adapter.GetBalance(ctx, w.DWalletID, "ETH")
			if err == nil && balance > 0 {
				s.upsertBalance(w.DWalletID, chainName, "ETH", balance)
				synced++
			}

			// Sync USDC balance
			balance, err = adapter.GetBalance(ctx, w.DWalletID, "USDC")
			if err == nil {
				s.upsertBalance(w.DWalletID, chainName, "USDC", balance)
				synced++
			}
		}
	}

	if synced > 0 {
		log.Printf("[syncer] synced %d balances", synced)
	}
}

func (s *BalanceSyncer) upsertBalance(dwalletID, chainName, token string, amount float64) {
	_, err := s.convex.Mutation("walletBalances:upsert", map[string]interface{}{
		"dwallet_id": dwalletID,
		"chain":      chainName,
		"token":      token,
		"amount":     amount,
	})
	if err != nil {
		log.Printf("[syncer] failed to upsert balance for %s/%s/%s: %v", dwalletID, chainName, token, err)
	}
}
