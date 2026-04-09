package engine

import (
	"fmt"
	"sync"
	"time"
)

// DedupCache suppresses repeated alerts within a configurable time window.
// In-memory only — resets on server restart (acceptable: missed dedup, not missed block).
// Keys are bucketed by time window; expired buckets are evicted on every call.
type DedupCache struct {
	mu   sync.Mutex
	seen map[string]time.Time // key → expiry timestamp
}

func NewDedupCache() *DedupCache {
	return &DedupCache{seen: make(map[string]time.Time)}
}

// ShouldSuppress returns true if this (ruleID, subject) pair has already fired
// within the current window. Evicts expired entries on every call.
func (d *DedupCache) ShouldSuppress(ruleID, subject string, window time.Duration) bool {
	key := fmt.Sprintf("%s:%s", ruleID, subject)
	now := time.Now()

	d.mu.Lock()
	defer d.mu.Unlock()

	// Evict expired entries (amortized O(n), keeps map bounded)
	if len(d.seen) > 100 {
		for k, expiry := range d.seen {
			if now.After(expiry) {
				delete(d.seen, k)
			}
		}
	}

	if expiry, exists := d.seen[key]; exists && now.Before(expiry) {
		return true
	}
	d.seen[key] = now.Add(window)
	return false
}
