package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
	"github.com/rhemify/server/internal/model"
	"github.com/rhemify/server/internal/signer"
)

const maxConcurrentPipelines = 20

type SigningHandler struct {
	convex   *cx.Client
	pipeline *signer.SigningPipeline
	sem      chan struct{} // concurrency limiter
}

func NewSigningHandler(convex *cx.Client, pipeline *signer.SigningPipeline) *SigningHandler {
	return &SigningHandler{
		convex:   convex,
		pipeline: pipeline,
		sem:      make(chan struct{}, maxConcurrentPipelines),
	}
}

type signingRequestPayload struct {
	FleetID       string  `json:"fleet_id" binding:"required"`
	AgentKey      string  `json:"agent_key" binding:"required"`
	DWalletID     string  `json:"dwallet_id" binding:"required"`
	TargetChain   string  `json:"target_chain" binding:"required"`
	TargetAddress string  `json:"target_address" binding:"required"`
	Token         string  `json:"token" binding:"required"`
	Amount        float64 `json:"amount" binding:"required"`
}

// POST /api/signing/request
func (h *SigningHandler) CreateSigningRequest(c *gin.Context) {
	var req signingRequestPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "internal error"})
		return
	}

	now := float64(time.Now().UnixMilli())

	// Create signing request in Convex with status "pending"
	result, err := h.convex.Mutation("signingRequests:create", map[string]interface{}{
		"fleet_id":       req.FleetID,
		"agent_key":      req.AgentKey,
		"dwallet_id":     req.DWalletID,
		"target_chain":   req.TargetChain,
		"target_address": req.TargetAddress,
		"token":          req.Token,
		"amount":         req.Amount,
		"status":         model.SigningStatusPending,
		"created_at":     now,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	var requestID string
	if err := json.Unmarshal(result, &requestID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse request ID"})
		return
	}

	// Check concurrency limit
	select {
	case h.sem <- struct{}{}:
	default:
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "too many concurrent signing requests"})
		return
	}

	// Build the signing context and run pipeline async
	sigReq := &model.SigningRequest{
		ID:            requestID,
		FleetID:       req.FleetID,
		DWalletID:     req.DWalletID,
		TargetChain:   req.TargetChain,
		TargetAddress: req.TargetAddress,
		Token:         req.Token,
		Amount:        req.Amount,
		Status:        model.SigningStatusPending,
		CreatedAt:     now,
	}

	go func() {
		defer func() { <-h.sem }()
		h.runPipeline(sigReq)
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"request_id": requestID,
		"status":     model.SigningStatusPending,
	})
}

func (h *SigningHandler) runPipeline(req *model.SigningRequest) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	sc := &signer.SigningContext{Request: req}

	if err := h.pipeline.Execute(ctx, sc); err != nil {
		log.Printf("[signing] pipeline error for %s: %v", req.ID, err)
		h.updateStatus(req.ID, model.SigningStatusFailed, err.Error())
		return
	}

	if sc.Rejection != "" {
		log.Printf("[signing] request %s rejected: %s", req.ID, sc.Rejection)
		h.updateStatus(req.ID, model.SigningStatusRejected, sc.Rejection)
		return
	}

	log.Printf("[signing] request %s completed", req.ID)
}

func (h *SigningHandler) updateStatus(requestID, status, reason string) {
	_, _ = h.convex.Mutation("signingRequests:updateStatus", map[string]interface{}{
		"request_id":       requestID,
		"status":           status,
		"rejection_reason": reason,
	})
}

// GET /api/signing/:id
func (h *SigningHandler) GetSigningRequest(c *gin.Context) {
	id := c.Param("id")

	result, err := h.convex.Query("signingRequests:get", map[string]string{
		"request_id": id,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	var sigReq interface{}
	if err := json.Unmarshal(result, &sigReq); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, sigReq)
}
