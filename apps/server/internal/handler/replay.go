package handler

import (
	"encoding/json"
	"log"
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

	// Parse optional request body (ignore EOF on empty body)
	var req replay.ReplayRequest
	if err := c.ShouldBindJSON(&req); err != nil && c.Request.ContentLength > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body"})
		return
	}

	// Fetch trace + event from Convex
	raw, err := h.convex.Query("traces:getForReplay", map[string]interface{}{
		"trace_id": traceID,
	})
	if err != nil {
		log.Printf("replay: failed to fetch trace %s: %v", traceID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	if string(raw) == "null" {
		c.JSON(http.StatusNotFound, gin.H{"error": "trace not found"})
		return
	}

	// Unmarshal Convex response
	var data struct {
		Trace map[string]interface{} `json:"trace"`
		Event map[string]interface{} `json:"event"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		log.Printf("replay: failed to unmarshal trace %s: %v", traceID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
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
		log.Printf("replay: failed for trace %s: %v", traceID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, result)
}
