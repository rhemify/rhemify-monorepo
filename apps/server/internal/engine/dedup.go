package engine

import (
	"fmt"
	"sync"
	"time"
)

// DedupCache suppresses repeated alerts within a configurable time window.
// In-memory only — resets on server restart (acceptable: missed dedup, not missed block).
type DedupCache struct {
	mu   sync.Mutex
	seen map[string]struct{}
}

func NewDedupCache() *DedupCache {
	return &DedupCache{seen: make(map[string]struct{})}
}

// ShouldSuppress returns true if this (ruleID, subject) pair has already fired
// within the current window bucket.
func (d *DedupCache) ShouldSuppress(ruleID, subject string, window time.Duration) bool {
	key := d.key(ruleID, subject, window)
	d.mu.Lock()
	defer d.mu.Unlock()
	if _, exists := d.seen[key]; exists {
		return true
	}
	d.seen[key] = struct{}{}
	return false
}

func (d *DedupCache) key(ruleID, subject string, window time.Duration) string {
	bucket := time.Now().Truncate(window).Unix()
	return fmt.Sprintf("%s:%s:%d", ruleID, subject, bucket)
}
