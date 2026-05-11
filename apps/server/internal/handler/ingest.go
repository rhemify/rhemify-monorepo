package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rhemify/server/internal/anchor"
	cx "github.com/rhemify/server/internal/convex"
	"github.com/rhemify/server/internal/engine"
)

type IngestHandler struct {
	convex  *cx.Client
	batcher *anchor.BatchManager
	engine  *engine.Engine
}

func NewIngestHandler(convex *cx.Client, batcher *anchor.BatchManager, eng *engine.Engine) *IngestHandler {
	return &IngestHandler{convex: convex, batcher: batcher, engine: eng}
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

	// SDK PaymentEvent / PaymentTrace / PolicyDecisionEvent carry extra fields
	// (id, timestamp, standard_version, delegation_depth, bridge_scoring, ...)
	// that the Convex mutation validators reject. Reshape to the schema-allowed
	// projection before insert — this is the SDK↔Convex contract boundary.
	reshapedEvent := reshapeEventForConvex(payload.Event)
	reshapedTrace := reshapeTraceForConvex(payload.Trace)

	// 1. Insert payment event
	eventResult, err := h.convex.Mutation("events:insert", reshapedEvent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to insert event: " + err.Error()})
		return
	}
	var eventID string
	if err := json.Unmarshal(eventResult, &eventID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse event ID: " + err.Error()})
		return
	}

	// 2. Insert payment trace
	if _, err = h.convex.Mutation("traces:insert", reshapedTrace); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to insert trace: " + err.Error()})
		return
	}

	// 3. Insert policy decisions (best-effort, pass eventID to avoid cross-linking)
	for _, decision := range payload.PolicyDecisions {
		reshapedDecision := reshapePolicyDecisionForConvex(decision)
		reshapedDecision["payment_event_id"] = eventID
		h.convex.Mutation("policies:insertDecision", reshapedDecision)
	}

	// 4. Update all derived data in one Convex transaction (vendor, agent, fleet, edge)
	if _, err := h.convex.Mutation("aggregates:updateAllDerived", map[string]interface{}{
		"agent_id": payload.Event["agent_id"],
		"fleet_id": payload.Event["fleet_id"],
		"domain":   payload.Event["domain"],
		"amount":   payload.Event["amount"],
		"outcome":  payload.Event["outcome"],
		"standard": payload.Event["standard"],
	}); err != nil {
		log.Printf("ingest: failed to update derived data: %v", err)
	}

	// 5. Run intelligence rules engine asynchronously (best-effort, doesn't block response)
	go h.engine.Evaluate(payload.Event, payload.Trace)

	// 6. Trigger Merkle batching
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

// reshapeEventForConvex projects the SDK PaymentEvent map onto the exact field
// set events:insert accepts. Drops id, timestamp, standard_version,
// parent_event_id, delegation_depth (SDK metadata Convex doesn't store). Derives
// `chain` (required) from chain_from/chain_to.
func reshapeEventForConvex(e map[string]interface{}) map[string]interface{} {
	chain, _ := e["chain_from"].(string)
	if chain == "" {
		chain, _ = e["chain_to"].(string)
	}
	out := map[string]interface{}{
		"agent_id":        e["agent_id"],
		"fleet_id":        e["fleet_id"],
		"standard":        e["standard"],
		"amount":          e["amount"],
		"token":           e["token"],
		"chain":           chain,
		"domain":          e["domain"],
		"outcome":         e["outcome"],
		"instrument_type": e["instrument_type"],
		"trace_id":        e["trace_id"],
	}
	if v, ok := e["chain_from"].(string); ok && v != "" {
		out["chain_from"] = v
	}
	if v, ok := e["chain_to"].(string); ok && v != "" {
		out["chain_to"] = v
	}
	return out
}

// reshapeTraceForConvex projects the SDK PaymentTrace map onto the exact field
// set traces:insert accepts. Maps agent_task_description → agent_task_context.
// Defaults confidence to "high" when the SDK omits it (current trace.finalize
// doesn't set it). Drops payment_event_id (Convex looks it up by trace_id since
// the SDK's "evt_*" string is not a valid Convex ID).
func reshapeTraceForConvex(t map[string]interface{}) map[string]interface{} {
	taskCtx, _ := t["agent_task_description"].(string)
	if taskCtx == "" {
		taskCtx, _ = t["agent_task_context"].(string)
	}
	confidence, _ := t["confidence"].(string)
	if confidence != "high" && confidence != "medium" && confidence != "low" {
		confidence = "high"
	}
	// instrument_selection_log validator is v.any() — pass through as-is, but
	// fall back to empty string if absent so the field is present.
	isl := t["instrument_selection_log"]
	if isl == nil {
		isl = ""
	}
	return map[string]interface{}{
		"id":                       t["id"],
		"trace_id":                 t["id"],
		"agent_task_context":       taskCtx,
		"trigger_402_raw":          stringOr(t["trigger_402_raw"], ""),
		"alternatives_evaluated":   t["alternatives_evaluated"],
		"policy_rules_fired":       t["policy_rules_fired"],
		"instrument_selection_log": isl,
		"confidence":               confidence,
		"replay_snapshot":          t["replay_snapshot"],
		"trace_hash":               stringOr(t["trace_hash"], ""),
	}
}

// reshapePolicyDecisionForConvex projects the SDK PolicyDecisionEvent map onto
// the exact field set policies:insertDecision accepts. Drops id and
// human_approval_required (SDK extras). payment_event_id is injected by the
// caller after events:insert returns the real Convex ID.
func reshapePolicyDecisionForConvex(d map[string]interface{}) map[string]interface{} {
	return map[string]interface{}{
		"agent_id":       stringOr(d["agent_id"], ""),
		"rule_triggered": stringOr(d["rule_triggered"], ""),
		"decision":       stringOr(d["decision"], "pass"),
		"threshold":      stringOr(d["threshold"], ""),
		"actual_value":   stringOr(d["actual_value"], ""),
		"domain":         stringOr(d["domain"], ""),
		"standard":       stringOr(d["standard"], "x402"),
	}
}

func stringOr(v interface{}, fallback string) string {
	if s, ok := v.(string); ok && s != "" {
		return s
	}
	return fallback
}
