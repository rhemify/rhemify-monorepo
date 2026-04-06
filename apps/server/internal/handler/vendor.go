package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
)

type VendorHandler struct {
	convex *cx.Client
}

func NewVendorHandler(convex *cx.Client) *VendorHandler {
	return &VendorHandler{convex: convex}
}

// GET /api/vendor/:domain — get vendor status
func (h *VendorHandler) GetVendorStatus(c *gin.Context) {
	domain := c.Param("domain")

	result, err := h.convex.Query("vendors:getByDomain", map[string]string{
		"domain": domain,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var vendor interface{}
	if err := json.Unmarshal(result, &vendor); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse: " + err.Error()})
		return
	}

	if vendor == nil {
		c.JSON(http.StatusOK, gin.H{
			"domain":       domain,
			"isBlocked":    false,
			"successRate":  1.0,
			"avgLatencyMs": 0,
		})
		return
	}

	c.JSON(http.StatusOK, vendor)
}
