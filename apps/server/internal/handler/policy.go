package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
)

type PolicyHandler struct {
	convex *cx.Client
}

func NewPolicyHandler(convex *cx.Client) *PolicyHandler {
	return &PolicyHandler{convex: convex}
}

// GET /api/policy/:agentId — get agent's current policy + aggregates
func (h *PolicyHandler) GetPolicy(c *gin.Context) {
	agentID := c.Param("agentId")

	result, err := h.convex.Query("policies:getWithContext", map[string]string{
		"agent_id": agentID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var policy interface{}
	if err := json.Unmarshal(result, &policy); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, policy)
}

// POST /api/policy/:agentId — update agent's policy
func (h *PolicyHandler) SetPolicy(c *gin.Context) {
	agentID := c.Param("agentId")

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	body["agent_id"] = agentID

	_, err := h.convex.Mutation("policies:upsert", body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
