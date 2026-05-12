// Package merkle implements the binary Merkle tree used to anchor a day's
// traces to Solana under one root hash. Leaves are SHA-256 hashes of each
// trace's content hash (already computed by the SDK on emit). Internal
// nodes are SHA-256(left || right). Odd-count levels duplicate the last
// node (standard padding rule).
//
// The on-chain anchor (programs/rhemify-anchor/.../write_daily_root) stores
// only the root + leaf count. Verifying any individual trace requires the
// leaf hash, its 0-indexed position, and a sibling-hash path produced by
// Path(); Verify() reconstructs the root from those.
//
// This package is intentionally dependency-free (only crypto/sha256) so
// the same code can be used in cmd/anchor utilities, the HTTP handler,
// and a future stand-alone CLI without picking up Convex / Solana RPC
// imports.
package merkle

import (
	"crypto/sha256"
	"errors"
	"fmt"
)

const HashSize = 32

// Hash is a 32-byte SHA-256 digest.
type Hash [HashSize]byte

// PathStep is one sibling along the leaf → root path. Side records whether
// the sibling is to the left or right of the running hash, which determines
// the concatenation order during verification.
type PathStep struct {
	Hash Hash
	Side Side
}

// Side describes which side of the parent concatenation the running hash
// goes on. If the sibling is on the right, the running hash is on the left
// (parent = sha256(running || sibling)) and vice versa.
type Side int

const (
	SiblingRight Side = iota // running hash is the left operand
	SiblingLeft              // running hash is the right operand
)

func (s Side) String() string {
	if s == SiblingRight {
		return "right"
	}
	return "left"
}

// HashLeaf computes the leaf hash for a content hash. Wrapping a content
// hash in its own SHA-256 round defends against second-preimage attacks
// where a forged internal-node value could be presented as a leaf.
func HashLeaf(contentHash Hash) Hash {
	prefixed := append([]byte{0x00}, contentHash[:]...)
	return sha256.Sum256(prefixed)
}

// HashLeafBytes is a convenience wrapper for callers that have a content
// hash as []byte (e.g. a hex-decoded trace_hash). Returns ErrShortLeaf if
// the input isn't 32 bytes.
func HashLeafBytes(contentHash []byte) (Hash, error) {
	if len(contentHash) != HashSize {
		return Hash{}, fmt.Errorf("merkle: leaf content hash must be %d bytes, got %d", HashSize, len(contentHash))
	}
	var fixed Hash
	copy(fixed[:], contentHash)
	return HashLeaf(fixed), nil
}

// HashNode computes the parent hash from a left + right child. Prepended
// 0x01 byte matches the leaf 0x00 prefix — Merkle domain separation that
// prevents leaf-as-node forgery.
func HashNode(left, right Hash) Hash {
	buf := make([]byte, 1+2*HashSize)
	buf[0] = 0x01
	copy(buf[1:], left[:])
	copy(buf[1+HashSize:], right[:])
	return sha256.Sum256(buf)
}

// Tree is a binary Merkle tree built from leaf hashes. The full level list
// is retained so Path() can compute proofs without re-hashing.
type Tree struct {
	Leaves []Hash
	// Levels[0] is the leaf layer (post-HashLeaf), Levels[len-1] is the
	// single-node root layer. For a 0-leaf tree, Levels is empty and Root()
	// returns the zero hash.
	Levels [][]Hash
}

// Build constructs a Merkle tree from already-leaf-hashed values. Each
// element of `leaves` must be the output of HashLeaf — Build does not
// re-hash. This separation lets callers compute leaf hashes once at insert
// time and reuse them across many proof requests.
func Build(leaves []Hash) *Tree {
	t := &Tree{Leaves: leaves}
	if len(leaves) == 0 {
		return t
	}
	level := leaves
	t.Levels = append(t.Levels, level)
	for len(level) > 1 {
		next := make([]Hash, 0, (len(level)+1)/2)
		for i := 0; i < len(level); i += 2 {
			left := level[i]
			// Odd-count: duplicate the last node up to the next level.
			right := left
			if i+1 < len(level) {
				right = level[i+1]
			}
			next = append(next, HashNode(left, right))
		}
		t.Levels = append(t.Levels, next)
		level = next
	}
	return t
}

// Root returns the Merkle root. For a 0-leaf tree the root is the zero
// hash — anchor handlers should refuse to submit a zero root.
func (t *Tree) Root() Hash {
	if len(t.Levels) == 0 {
		return Hash{}
	}
	return t.Levels[len(t.Levels)-1][0]
}

// Path produces the sibling list a verifier needs to recompute the root
// from leaves[index]. Errors if index is out of range or the tree has no
// leaves (no path possible).
func (t *Tree) Path(index int) ([]PathStep, error) {
	if len(t.Levels) == 0 {
		return nil, errors.New("merkle: empty tree has no paths")
	}
	if index < 0 || index >= len(t.Leaves) {
		return nil, fmt.Errorf("merkle: leaf index %d out of range [0, %d)", index, len(t.Leaves))
	}
	path := make([]PathStep, 0, len(t.Levels)-1)
	cursor := index
	for level := 0; level < len(t.Levels)-1; level++ {
		layer := t.Levels[level]
		// Sibling is the partner cursor xor 1. For odd-count layers,
		// the last node's sibling is itself (the duplicate-last rule).
		siblingIdx := cursor ^ 1
		var sibling Hash
		var side Side
		if siblingIdx >= len(layer) {
			sibling = layer[cursor] // duplicate
			side = SiblingRight     // duplicate is always paired as "right"
		} else {
			sibling = layer[siblingIdx]
			if cursor%2 == 0 {
				side = SiblingRight
			} else {
				side = SiblingLeft
			}
		}
		path = append(path, PathStep{Hash: sibling, Side: side})
		cursor /= 2
	}
	return path, nil
}

// Verify recomputes the root from a leaf hash + path and reports whether
// it matches the expected root. Used by anyone with the proof (e.g. the
// CLI / a third-party auditor) to confirm a trace is in the day's batch
// without trusting the server.
func Verify(leaf Hash, path []PathStep, expectedRoot Hash) bool {
	running := leaf
	for _, step := range path {
		if step.Side == SiblingRight {
			running = HashNode(running, step.Hash)
		} else {
			running = HashNode(step.Hash, running)
		}
	}
	return running == expectedRoot
}
