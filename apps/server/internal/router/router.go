package router

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rhemify/server/internal/config"
	"github.com/rhemify/server/internal/handler"
)

func Setup(db *pgxpool.Pool, cfg *config.Config) *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.CORSOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	health := handler.NewHealthHandler(db)
	fleet := handler.NewFleetHandler(db)
	events := handler.NewEventsHandler(db)
	traces := handler.NewTracesHandler(db)

	api := r.Group("/api")
	{
		api.GET("/health", health.Check)

		api.GET("/fleet/stats", fleet.GetStats)
		api.GET("/fleet/agents", fleet.ListAgents)
		api.GET("/fleet/agents/:id", fleet.GetAgent)

		api.GET("/events", events.ListEvents)
		api.GET("/events/:id", events.GetEvent)

		api.GET("/traces/:id", traces.GetTrace)
	}

	return r
}
