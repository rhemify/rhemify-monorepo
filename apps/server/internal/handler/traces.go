package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
)

type TracesHandler struct {
	convex *cx.Client
}

func NewTracesHandler(convex *cx.Client) *TracesHandler {
	return &TracesHandler{convex: convex}
}

// GET /api/traces/:id
func (h *TracesHandler) GetTrace(c *gin.Context) {
	traceID := c.Param("id")

	result, err := h.convex.Query("traces:get", map[string]string{
		"id": traceID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var trace interface{}
	if err := json.Unmarshal(result, &trace); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse trace: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, trace)
}
