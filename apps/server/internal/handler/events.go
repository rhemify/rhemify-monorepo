package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
)

type EventsHandler struct {
	convex *cx.Client
}

func NewEventsHandler(convex *cx.Client) *EventsHandler {
	return &EventsHandler{convex: convex}
}

// GET /api/events — paginated, filterable
func (h *EventsHandler) ListEvents(c *gin.Context) {
	fleetID := c.Query("fleet_id")
	if fleetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "fleet_id is required"})
		return
	}

	args := map[string]interface{}{
		"fleet_id": fleetID,
	}
	if agentID := c.Query("agent_id"); agentID != "" {
		args["agent_id"] = agentID
	}
	if outcome := c.Query("outcome"); outcome != "" {
		args["outcome"] = outcome
	}

	result, err := h.convex.Query("events:list", args)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var events interface{}
	json.Unmarshal(result, &events)
	c.JSON(http.StatusOK, events)
}

// GET /api/events/:id — single event with linked trace
func (h *EventsHandler) GetEvent(c *gin.Context) {
	eventID := c.Param("id")

	result, err := h.convex.Query("events:get", map[string]string{
		"id": eventID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var event interface{}
	json.Unmarshal(result, &event)
	c.JSON(http.StatusOK, event)
}
