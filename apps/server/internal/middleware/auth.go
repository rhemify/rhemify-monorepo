package middleware

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	cx "github.com/rhemify/server/internal/convex"
)

// cached fleet lookup to avoid hitting Convex on every request
type fleetEntry struct {
	fleetID     string
	companyName string
	cachedAt    time.Time
}

var (
	fleetCache   = make(map[string]*fleetEntry)
	fleetCacheMu sync.RWMutex
	cacheTTL     = 5 * time.Minute
)

// FleetAPIKeyAuth validates the Authorization: Bearer <fleetApiKey> header.
// Resolves the API key to a fleet_id via Convex (cached for 5 min).
// Sets "fleet_id" and "fleet_api_key" in the gin context.
func FleetAPIKeyAuth(convex ...*cx.Client) gin.HandlerFunc {
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

		c.Set("fleet_api_key", apiKey)

		// If no Convex client provided, accept any key (backwards compat for tests)
		if len(convex) == 0 || convex[0] == nil {
			c.Next()
			return
		}

		// Check cache
		fleetCacheMu.RLock()
		entry, ok := fleetCache[apiKey]
		fleetCacheMu.RUnlock()

		if ok && time.Since(entry.cachedAt) < cacheTTL {
			c.Set("fleet_id", entry.fleetID)
			c.Next()
			return
		}

		// Lookup in Convex
		raw, err := convex[0].Query("fleets:getByApiKey", map[string]interface{}{
			"api_key": apiKey,
		})
		if err != nil {
			log.Printf("auth: failed to validate API key: %v", err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		if string(raw) == "null" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid API key"})
			return
		}

		var result struct {
			FleetID     string `json:"fleet_id"`
			CompanyName string `json:"company_name"`
		}
		if err := json.Unmarshal(raw, &result); err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}

		// Cache it
		fleetCacheMu.Lock()
		fleetCache[apiKey] = &fleetEntry{
			fleetID:     result.FleetID,
			companyName: result.CompanyName,
			cachedAt:    time.Now(),
		}
		fleetCacheMu.Unlock()

		c.Set("fleet_id", result.FleetID)
		c.Next()
	}
}
