package chain

import "testing"

func TestRegistryGet(t *testing.T) {
	base := NewBaseAdapter("https://sepolia.base.org")
	registry := NewChainRegistry(base)

	// Known chain returns adapter
	adapter, err := registry.Get("base")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if adapter.Chain() != "base" {
		t.Fatalf("expected chain 'base', got %q", adapter.Chain())
	}

	// Unknown chain returns error
	_, err = registry.Get("unknown")
	if err == nil {
		t.Fatal("expected error for unknown chain")
	}

	// Empty registry
	empty := NewChainRegistry()
	_, err = empty.Get("base")
	if err == nil {
		t.Fatal("expected error for empty registry")
	}
}

func TestRegistryChains(t *testing.T) {
	base := NewBaseAdapter("https://sepolia.base.org")
	registry := NewChainRegistry(base)

	chains := registry.Chains()
	if len(chains) != 1 || chains[0] != "base" {
		t.Fatalf("expected [base], got %v", chains)
	}
}
