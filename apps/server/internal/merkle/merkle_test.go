package merkle

import (
	"crypto/sha256"
	"testing"
)

// helper: fabricate a leaf hash deterministic from a label
func leaf(s string) Hash {
	content := sha256.Sum256([]byte(s))
	return HashLeaf(content)
}

func TestBuild_Empty(t *testing.T) {
	tree := Build(nil)
	if tree.Root() != (Hash{}) {
		t.Fatal("empty tree root should be zero hash")
	}
	if _, err := tree.Path(0); err == nil {
		t.Fatal("empty tree should reject path requests")
	}
}

func TestBuild_SingleLeaf(t *testing.T) {
	l := leaf("only")
	tree := Build([]Hash{l})
	if tree.Root() != l {
		t.Fatal("single-leaf root must equal the leaf itself")
	}
	path, err := tree.Path(0)
	if err != nil {
		t.Fatalf("path on 1-leaf tree: %v", err)
	}
	if len(path) != 0 {
		t.Fatalf("1-leaf path must be empty, got %d steps", len(path))
	}
	if !Verify(l, path, l) {
		t.Fatal("1-leaf proof should verify")
	}
}

func TestBuild_TwoLeaves(t *testing.T) {
	a := leaf("alice")
	b := leaf("bob")
	tree := Build([]Hash{a, b})
	expectedRoot := HashNode(a, b)
	if tree.Root() != expectedRoot {
		t.Fatal("2-leaf root must be HashNode(a, b)")
	}
	for i, want := range []Hash{a, b} {
		path, err := tree.Path(i)
		if err != nil {
			t.Fatalf("path %d: %v", i, err)
		}
		if !Verify(want, path, expectedRoot) {
			t.Fatalf("proof at index %d must verify", i)
		}
	}
}

func TestBuild_OddCountDuplicatesLast(t *testing.T) {
	// 3-leaf tree: layer 0 = [a,b,c], layer 1 = [H(a,b), H(c,c)],
	// layer 2 = [H(H(a,b), H(c,c))]. All three should produce verifiable
	// proofs against the root.
	a, b, c := leaf("a"), leaf("b"), leaf("c")
	tree := Build([]Hash{a, b, c})
	root := tree.Root()
	for i, want := range []Hash{a, b, c} {
		path, err := tree.Path(i)
		if err != nil {
			t.Fatalf("path %d: %v", i, err)
		}
		if !Verify(want, path, root) {
			t.Fatalf("odd-count tree must verify leaf %d", i)
		}
	}
}

func TestBuild_FourLeaves(t *testing.T) {
	leaves := []Hash{leaf("0"), leaf("1"), leaf("2"), leaf("3")}
	tree := Build(leaves)
	root := tree.Root()
	for i, want := range leaves {
		path, err := tree.Path(i)
		if err != nil {
			t.Fatalf("path %d: %v", i, err)
		}
		if !Verify(want, path, root) {
			t.Fatalf("4-leaf tree must verify leaf %d", i)
		}
	}
}

func TestVerify_RejectsWrongLeaf(t *testing.T) {
	leaves := []Hash{leaf("0"), leaf("1"), leaf("2"), leaf("3")}
	tree := Build(leaves)
	path, _ := tree.Path(2)
	// Path is for leaf 2; using leaf("0") with that path must NOT verify.
	if Verify(leaf("0"), path, tree.Root()) {
		t.Fatal("verify should reject a mismatched leaf")
	}
}

func TestVerify_RejectsWrongRoot(t *testing.T) {
	leaves := []Hash{leaf("a"), leaf("b")}
	tree := Build(leaves)
	path, _ := tree.Path(0)
	wrongRoot := leaf("not_the_root")
	if Verify(leaves[0], path, wrongRoot) {
		t.Fatal("verify should reject a forged root")
	}
}

func TestPath_OutOfRange(t *testing.T) {
	tree := Build([]Hash{leaf("a"), leaf("b")})
	if _, err := tree.Path(-1); err == nil {
		t.Fatal("expected error for negative index")
	}
	if _, err := tree.Path(2); err == nil {
		t.Fatal("expected error for out-of-range index")
	}
}

func TestHashLeaf_DomainSeparation(t *testing.T) {
	// Leaf prefix 0x00 + node prefix 0x01 means a leaf hash and a node hash
	// over the same 32-byte input can never collide. Critical for
	// second-preimage defense.
	same := sha256.Sum256([]byte("same"))
	leafHash := HashLeaf(same)
	nodeHash := HashNode(same, same)
	if leafHash == nodeHash {
		t.Fatal("leaf hash and node hash over same input must differ — domain separation broken")
	}
}

func TestHashLeafBytes_RejectsBadLength(t *testing.T) {
	if _, err := HashLeafBytes(make([]byte, 31)); err == nil {
		t.Fatal("HashLeafBytes should reject under-31-byte input")
	}
	if _, err := HashLeafBytes(make([]byte, 33)); err == nil {
		t.Fatal("HashLeafBytes should reject over-32-byte input")
	}
}
