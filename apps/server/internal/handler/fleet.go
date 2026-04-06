package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
)

type FleetHandler struct {
	convex *cx.Client
}

func NewFleetHandler(convex *cx.Client) *FleetHandler {
	return &FleetHandler{convex: convex}
}

// GET /api/fleet/stats
func (h *FleetHandler) GetStats(c *gin.Context) {
	fleetID := c.Query("fleet_id")
	if fleetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "fleet_id is required"})
		return
	}

	result, err := h.convex.Query("fleet:getStats", map[string]string{
		"fleet_id": fleetID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var stats interface{}
	json.Unmarshal(result, &stats)
	c.JSON(http.StatusOK, stats)
}

// GET /api/fleet/agents
func (h *FleetHandler) ListAgents(c *gin.Context) {
	fleetID := c.Query("fleet_id")
	if fleetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "fleet_id is required"})
		return
	}

	result, err := h.convex.Query("fleet:listAgents", map[string]string{
		"fleet_id": fleetID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var agents interface{}
	json.Unmarshal(result, &agents)
	c.JSON(http.StatusOK, agents)
}

// GET /api/fleet/agents/:id
func (h *FleetHandler) GetAgent(c *gin.Context) {
	agentID := c.Param("id")

	result, err := h.convex.Query("fleet:getAgent", map[string]string{
		"agent_id": agentID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var agent interface{}
	json.Unmarshal(result, &agent)
	c.JSON(http.StatusOK, agent)
}
