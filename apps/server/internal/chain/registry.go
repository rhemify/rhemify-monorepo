package chain

import "fmt"

// ChainRegistry holds adapters for supported chains.
type ChainRegistry struct {
	adapters map[string]ChainAdapter
}

// NewChainRegistry creates a registry pre-loaded with the given adapters.
func NewChainRegistry(adapters ...ChainAdapter) *ChainRegistry {
	r := &ChainRegistry{
		adapters: make(map[string]ChainAdapter, len(adapters)),
	}
	for _, a := range adapters {
		r.adapters[a.Chain()] = a
	}
	return r
}

// Get returns the adapter for the given chain, or an error if unsupported.
func (r *ChainRegistry) Get(chain string) (ChainAdapter, error) {
	a, ok := r.adapters[chain]
	if !ok {
		return nil, fmt.Errorf("unsupported chain: %s", chain)
	}
	return a, nil
}

// Chains returns the list of supported chain identifiers.
func (r *ChainRegistry) Chains() []string {
	chains := make([]string, 0, len(r.adapters))
	for k := range r.adapters {
		chains = append(chains, k)
	}
	return chains
}
