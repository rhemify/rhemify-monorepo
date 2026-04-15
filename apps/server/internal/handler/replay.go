package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
	"github.com/rhemify/server/internal/replay"
)

type ReplayHandler struct {
	convex *cx.Client
}

func NewReplayHandler(convex *cx.Client) *ReplayHandler {
	return &ReplayHandler{convex: convex}
}

// POST /api/traces/:id/replay — replay a payment decision with optional policy overrides
func (h *ReplayHandler) HandleReplay(c *gin.Context) {
	traceID := c.Param("id")

	// Parse optional request body
	var req replay.ReplayRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body: " + err.Error()})
			return
		}
	}

	// Fetch trace + event from Convex
	raw, err := h.convex.Query("traces:getForReplay", map[string]interface{}{
		"trace_id": traceID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch trace"})
		return
	}
	if string(raw) == "null" {
		c.JSON(http.StatusNotFound, gin.H{"error": "trace not found: " + traceID})
		return
	}

	// Unmarshal Convex response
	var data struct {
		Trace map[string]interface{} `json:"trace"`
		Event map[string]interface{} `json:"event"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse trace data"})
		return
	}

	// Extract replay_snapshot and policy_rules_fired from trace
	replaySnapshot, _ := data.Trace["replay_snapshot"].(map[string]interface{})
	if replaySnapshot == nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":   "incomplete snapshot",
			"missing": []string{"replay_snapshot"},
		})
		return
	}

	policyRulesFired, _ := data.Trace["policy_rules_fired"].([]interface{})

	// Build event map from the linked payment_event
	event := data.Event
	if event == nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "no linked payment event"})
		return
	}

	// Run replay
	result, err := replay.Replay(traceID, replaySnapshot, policyRulesFired, event, req.PolicyOverrides)
	if err != nil {
		if snapErr, ok := err.(*replay.SnapshotError); ok {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error":   "incomplete snapshot",
				"missing": snapErr.Missing,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "replay failed"})
		return
	}

	c.JSON(http.StatusOK, result)
}
