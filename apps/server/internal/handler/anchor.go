package handler

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
	"github.com/rhemify/server/internal/merkle"
)

type AnchorHandler struct {
	convex *cx.Client
}

func NewAnchorHandler(convex *cx.Client) *AnchorHandler {
	return &AnchorHandler{convex: convex}
}

type AnchorUpdatePayload struct {
	AnchorTxHash string `json:"anchorTxHash" binding:"required"`
}

// PATCH /api/traces/:id/anchor — update trace with Memo tx signature
func (h *AnchorHandler) UpdateTraceAnchor(c *gin.Context) {
	traceID := c.Param("id")

	var payload AnchorUpdatePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := h.convex.Mutation("traces:updateAnchor", map[string]string{
		"trace_id":        traceID,
		"anchor_tx_hash":  payload.AnchorTxHash,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GET /api/anchor/verify/:traceId — get trace + Merkle proof for verification
func (h *AnchorHandler) VerifyTrace(c *gin.Context) {
	traceID := c.Param("traceId")

	result, err := h.convex.Query("anchors:getVerification", map[string]string{
		"trace_id": traceID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var verification interface{}
	if err := json.Unmarshal(result, &verification); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, verification)
}

// fleetDateTrace is one row from traces:listByFleetDate. Decoded inline so
// downstream handlers can move past the JSON layer quickly.
type fleetDateTrace struct {
	TraceID     string  `json:"trace_id"`
	TraceHash   string  `json:"trace_hash"`
	CreatedAtMs float64 `json:"created_at_ms"`
	LeafIndex   float64 `json:"leaf_index"`
}

// merkleProofResponse is the wire format for GetMerkleProof. Strings are
// lowercase hex for every 32-byte value so CLI consumers don't have to
// guess encoding.
type merkleProofResponse struct {
	FleetID    string           `json:"fleet_id"`
	Date       string           `json:"date"`
	TraceID    string           `json:"trace_id"`
	TraceHash  string           `json:"trace_hash"`
	LeafIndex  int              `json:"leaf_index"`
	LeafHash   string           `json:"leaf_hash"`
	Root       string           `json:"root"`
	TraceCount int              `json:"trace_count"`
	Path       []proofStepJSON  `json:"path"`
}

type proofStepJSON struct {
	Hash string `json:"hash"`
	Side string `json:"side"` // "right" (sibling on right of running hash) | "left"
}

// GET /api/anchor/:fleetId/:date/merkle-proof?trace_id=X
//
// Builds the day's Merkle tree from Convex, returns the root + the proof
// path for the requested trace. The CLI verifies the proof locally and
// compares the root against the on-chain anchor — no need to trust the
// server-side computation.
//
// Why server-side and not in the CLI: the leaves are derived from EVERY
// trace for the fleet+date. Re-fetching all of them per-verify on the
// client would burn a lot of Convex bandwidth; the Go server is already
// the integration boundary that talks to Convex and can cache cheaply.
func (h *AnchorHandler) GetMerkleProof(c *gin.Context) {
	fleetID := c.Param("fleetId")
	date := c.Param("date")
	traceID := c.Query("trace_id")
	if traceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "trace_id query param required"})
		return
	}

	raw, err := h.convex.Query("traces:listByFleetDate", map[string]interface{}{
		"fleet_id": fleetID,
		"date":     date,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "convex listByFleetDate: " + err.Error()})
		return
	}
	var rows []fleetDateTrace
	if err := json.Unmarshal(raw, &rows); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "decode listByFleetDate: " + err.Error()})
		return
	}
	if len(rows) == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": fmt.Sprintf("no traces for fleet %s on %s", fleetID, date),
		})
		return
	}

	// Hash each leaf once. trace_hash on the Convex doc is the SDK's
	// content hash — hex-decode then wrap with HashLeaf for domain
	// separation.
	leaves := make([]merkle.Hash, 0, len(rows))
	targetIdx := -1
	var targetTraceHash string
	for i, r := range rows {
		raw, err := hex.DecodeString(r.TraceHash)
		if err != nil || len(raw) != merkle.HashSize {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": fmt.Sprintf("trace %s has malformed trace_hash %q", r.TraceID, r.TraceHash),
			})
			return
		}
		leafContent, err := merkle.HashLeafBytes(raw)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		leaves = append(leaves, leafContent)
		if r.TraceID == traceID {
			targetIdx = i
			targetTraceHash = r.TraceHash
		}
	}
	if targetIdx == -1 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": fmt.Sprintf("trace %s not present in fleet %s on %s", traceID, fleetID, date),
		})
		return
	}

	tree := merkle.Build(leaves)
	path, err := tree.Path(targetIdx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "build path: " + err.Error()})
		return
	}

	steps := make([]proofStepJSON, len(path))
	for i, step := range path {
		steps[i] = proofStepJSON{
			Hash: hex.EncodeToString(step.Hash[:]),
			Side: step.Side.String(),
		}
	}

	root := tree.Root()
	resp := merkleProofResponse{
		FleetID:    fleetID,
		Date:       date,
		TraceID:    traceID,
		TraceHash:  targetTraceHash,
		LeafIndex:  targetIdx,
		LeafHash:   hex.EncodeToString(leaves[targetIdx][:]),
		Root:       hex.EncodeToString(root[:]),
		TraceCount: len(leaves),
		Path:       steps,
	}
	c.JSON(http.StatusOK, resp)
}

// GET /api/anchor/:fleetId/:date — get daily Merkle root info
func (h *AnchorHandler) GetDailyRoot(c *gin.Context) {
	fleetID := c.Param("fleetId")
	date := c.Param("date")

	result, err := h.convex.Query("anchors:getDailyRoot", map[string]interface{}{
		"fleet_id": fleetID,
		"date":     date,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var root interface{}
	if err := json.Unmarshal(result, &root); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, root)
}
