package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
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
