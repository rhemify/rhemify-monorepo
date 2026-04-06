package anchor

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
)

// MerkleTree holds the tree layers built from leaf hashes.
// Only the root and proofs are needed after construction.
type MerkleTree struct {
	Leaves [][]byte
	Layers [][][]byte
	Root   []byte
}

// BuildMerkleTree constructs a SHA-256 Merkle tree from hex-encoded trace hashes.
// Pads to next power of 2 with zero-hashes.
func BuildMerkleTree(hexHashes []string) (*MerkleTree, error) {
	if len(hexHashes) == 0 {
		return nil, errors.New("cannot build Merkle tree from empty hash list")
	}

	leaves := make([][]byte, len(hexHashes))
	for i, h := range hexHashes {
		b, err := hex.DecodeString(h)
		if err != nil {
			return nil, errors.New("invalid hex hash at index " + strconv.Itoa(i))
		}
		leaves[i] = b
	}

	// Pad to power of 2
	targetSize := nextPowerOf2(len(leaves))
	zeroHash := make([]byte, 32)
	for len(leaves) < targetSize {
		leaves = append(leaves, zeroHash)
	}

	layers := [][][]byte{leaves}
	currentLayer := leaves

	for len(currentLayer) > 1 {
		var nextLayer [][]byte
		for i := 0; i < len(currentLayer); i += 2 {
			nextLayer = append(nextLayer, hashPair(currentLayer[i], currentLayer[i+1]))
		}
		layers = append(layers, nextLayer)
		currentLayer = nextLayer
	}

	return &MerkleTree{
		Leaves: leaves,
		Layers: layers,
		Root:   currentLayer[0],
	}, nil
}

// RootHex returns the root hash as hex string.
func (t *MerkleTree) RootHex() string {
	return hex.EncodeToString(t.Root)
}

// GetProof returns the Merkle proof (sibling hashes) for a leaf at the given index.
func (t *MerkleTree) GetProof(index int) ([][]byte, error) {
	if index < 0 || index >= len(t.Leaves) {
		return nil, errors.New("index out of bounds")
	}

	var proof [][]byte
	currentIndex := index

	for layerIdx := 0; layerIdx < len(t.Layers)-1; layerIdx++ {
		layer := t.Layers[layerIdx]
		siblingIndex := currentIndex ^ 1 // flip last bit

		if siblingIndex < len(layer) {
			proof = append(proof, layer[siblingIndex])
		}

		currentIndex /= 2
	}

	return proof, nil
}

// GetProofHex returns the proof as hex strings.
func (t *MerkleTree) GetProofHex(index int) ([]string, error) {
	proof, err := t.GetProof(index)
	if err != nil {
		return nil, err
	}

	hexProof := make([]string, len(proof))
	for i, p := range proof {
		hexProof[i] = hex.EncodeToString(p)
	}
	return hexProof, nil
}

// VerifyProof checks that a leaf + proof produces the expected root.
func VerifyProof(leafHex string, proofHex []string, rootHex string) bool {
	current, err := hex.DecodeString(leafHex)
	if err != nil {
		return false
	}

	for _, siblingHex := range proofHex {
		sibling, err := hex.DecodeString(siblingHex)
		if err != nil {
			return false
		}
		current = hashPair(current, sibling)
	}

	return hex.EncodeToString(current) == rootHex
}

func hashPair(a, b []byte) []byte {
	// Consistent ordering: smaller hash on left
	if bytes.Compare(a, b) > 0 {
		a, b = b, a
	}
	h := sha256.New()
	h.Write(a)
	h.Write(b)
	return h.Sum(nil)
}

func nextPowerOf2(n int) int {
	power := 1
	for power < n {
		power *= 2
	}
	return power
}
