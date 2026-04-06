package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rhemify/server/internal/anchor"
	cx "github.com/rhemify/server/internal/convex"
)

type IngestHandler struct {
	convex  *cx.Client
	batcher *anchor.BatchManager
}

func NewIngestHandler(convex *cx.Client, batcher *anchor.BatchManager) *IngestHandler {
	return &IngestHandler{convex: convex, batcher: batcher}
}

type IngestPayload struct {
	Event           map[string]interface{}   `json:"event" binding:"required"`
	Trace           map[string]interface{}   `json:"trace" binding:"required"`
	PolicyDecisions []map[string]interface{} `json:"policyDecisions" binding:"required"`
}

// POST /api/ingest/payment — ingest a payment event + trace + policy decisions
func (h *IngestHandler) IngestPayment(c *gin.Context) {
	var payload IngestPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Insert payment event
	eventResult, err := h.convex.Mutation("events:insert", payload.Event)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to insert event: " + err.Error()})
		return
	}

	// Unmarshal the Convex document ID (json.RawMessage contains quoted string)
	var eventID string
	if err := json.Unmarshal(eventResult, &eventID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse event ID: " + err.Error()})
		return
	}

	// Insert payment trace
	_, err = h.convex.Mutation("traces:insert", payload.Trace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to insert trace: " + err.Error()})
		return
	}

	// Insert policy decisions — pass the eventID to avoid cross-linking under concurrent load
	for _, decision := range payload.PolicyDecisions {
		decision["payment_event_id"] = eventID
		h.convex.Mutation("policies:insertDecision", decision)
	}

	// Notify batch manager (triggers Merkle batching if thresholds met)
	fleetID, _ := payload.Event["fleet_id"].(string)
	traceHash, _ := payload.Trace["trace_hash"].(string)
	if fleetID != "" && traceHash != "" {
		h.batcher.OnTraceIngested(fleetID, traceHash)
	}

	c.JSON(http.StatusOK, gin.H{
		"eventId": eventID,
		"traceId": payload.Trace["id"],
	})
}
