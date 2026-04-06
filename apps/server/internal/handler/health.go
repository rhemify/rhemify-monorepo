package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
)

type HealthHandler struct {
	convex *cx.Client
}

func NewHealthHandler(convex *cx.Client) *HealthHandler {
	return &HealthHandler{convex: convex}
}

// GET /api/health
func (h *HealthHandler) Check(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "rhemify-intelligence",
	})
}
