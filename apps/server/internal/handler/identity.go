package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rhemify/server/internal/ika"
)

type IdentityHandler struct {
	ikaClient *ika.Client
}

func NewIdentityHandler(ikaClient *ika.Client) *IdentityHandler {
	return &IdentityHandler{ikaClient: ikaClient}
}

// GET /api/identity/resolve/:domain
func (h *IdentityHandler) ResolveDomain(c *gin.Context) {
	if h.ikaClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "identity service not available"})
		return
	}

	domain := c.Param("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domain required"})
		return
	}

	var result json.RawMessage
	err := h.ikaClient.GetRaw(c.Request.Context(), "/identity/resolve/"+domain, &result)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "domain not found"})
		return
	}

	c.Data(http.StatusOK, "application/json", result)
}

// GET /api/identity/subdomains/:domain
func (h *IdentityHandler) ListAgentSubdomains(c *gin.Context) {
	if h.ikaClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "identity service not available"})
		return
	}

	domain := c.Param("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domain required"})
		return
	}

	var result json.RawMessage
	err := h.ikaClient.GetRaw(c.Request.Context(), "/identity/subdomains/"+domain, &result)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list subdomains"})
		return
	}

	c.Data(http.StatusOK, "application/json", result)
}
