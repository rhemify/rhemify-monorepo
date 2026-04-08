package engine

import (
	"testing"
	"time"
)

func TestDedupCache_SuppressesWithinWindow(t *testing.T) {
	d := NewDedupCache()

	if d.ShouldSuppress("SA-1", "agent-1", 24*time.Hour) {
		t.Error("first call should not suppress")
	}
	if !d.ShouldSuppress("SA-1", "agent-1", 24*time.Hour) {
		t.Error("second call within window should suppress")
	}
}

func TestDedupCache_DifferentSubjectNotSuppressed(t *testing.T) {
	d := NewDedupCache()

	d.ShouldSuppress("SA-1", "agent-1", 24*time.Hour)

	if d.ShouldSuppress("SA-1", "agent-2", 24*time.Hour) {
		t.Error("different subject should not suppress")
	}
}

func TestDedupCache_DifferentRuleNotSuppressed(t *testing.T) {
	d := NewDedupCache()

	d.ShouldSuppress("SA-1", "agent-1", 24*time.Hour)

	if d.ShouldSuppress("SA-3", "agent-1", 6*time.Hour) {
		t.Error("different rule should not suppress")
	}
}
