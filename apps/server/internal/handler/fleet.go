package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type FleetHandler struct {
	db *pgxpool.Pool
}

func NewFleetHandler(db *pgxpool.Pool) *FleetHandler {
	return &FleetHandler{db: db}
}

// GET /api/fleet/stats
func (h *FleetHandler) GetStats(c *gin.Context) {
	// TODO: query aggregated fleet stats from payment_events + agents
	c.JSON(http.StatusOK, gin.H{"message": "not implemented"})
}

// GET /api/fleet/agents
func (h *FleetHandler) ListAgents(c *gin.Context) {
	// TODO: query agents with spend summaries
	c.JSON(http.StatusOK, gin.H{"message": "not implemented"})
}

// GET /api/fleet/agents/:id
func (h *FleetHandler) GetAgent(c *gin.Context) {
	_ = c.Param("id")
	// TODO: query single agent with detail
	c.JSON(http.StatusOK, gin.H{"message": "not implemented"})
}
