package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// FleetAPIKeyAuth validates the Authorization: Bearer <fleetApiKey> header.
// For hackathon: accepts any non-empty key and passes it as fleet context.
// Post-hackathon: validate key against fleet record in Convex.
func FleetAPIKeyAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing Authorization header"})
			return
		}

		if !strings.HasPrefix(auth, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid Authorization format, expected Bearer <key>"})
			return
		}

		apiKey := strings.TrimPrefix(auth, "Bearer ")
		if apiKey == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "empty API key"})
			return
		}

		// Store the API key in context for downstream handlers
		c.Set("fleet_api_key", apiKey)
		c.Next()
	}
}
