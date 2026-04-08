package router

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/rhemify/server/internal/anchor"
	"github.com/rhemify/server/internal/config"
	cx "github.com/rhemify/server/internal/convex"
	"github.com/rhemify/server/internal/engine"
	"github.com/rhemify/server/internal/handler"
	"github.com/rhemify/server/internal/ika"
	"github.com/rhemify/server/internal/middleware"
	"github.com/rhemify/server/internal/signer"
)

// Deps holds optional dependencies for new dWallet features.
type Deps struct {
	Cosigner  *signer.Cosigner
	Pipeline  *signer.SigningPipeline
	IkaClient *ika.Client
}

func Setup(convex *cx.Client, cfg *config.Config, deps ...*Deps) *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.CORSOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	batcher := anchor.NewBatchManager(convex)
	eng := engine.New(convex)

	health := handler.NewHealthHandler(convex)
	fleet := handler.NewFleetHandler(convex)
	events := handler.NewEventsHandler(convex)
	traces := handler.NewTracesHandler(convex)
	ingest := handler.NewIngestHandler(convex, batcher, eng)
	policy := handler.NewPolicyHandler(convex)
	anchorHandler := handler.NewAnchorHandler(convex)
	vendor := handler.NewVendorHandler(convex)

	api := r.Group("/api")
	{
		// Public endpoints (no auth)
		api.GET("/health", health.Check)

		// Dashboard endpoints (read-only, no auth for now)
		api.GET("/fleet/stats", fleet.GetStats)
		api.GET("/fleet/agents", fleet.ListAgents)
		api.GET("/fleet/agents/:id", fleet.GetAgent)
		api.GET("/events", events.ListEvents)
		api.GET("/events/:id", events.GetEvent)
		api.GET("/traces/:id", traces.GetTrace)

		// SNS Identity (public — anyone can resolve a .sol domain)
		if len(deps) > 0 && deps[0] != nil && deps[0].IkaClient != nil {
			identity := handler.NewIdentityHandler(deps[0].IkaClient)
			api.GET("/identity/resolve/:domain", identity.ResolveDomain)
			api.GET("/identity/subdomains/:domain", identity.ListAgentSubdomains)
		}

		// SDK endpoints (require fleet API key)
		sdk := api.Group("")
		sdk.Use(middleware.FleetAPIKeyAuth())
		{
			sdk.POST("/ingest/payment", ingest.IngestPayment)
			sdk.GET("/policy/:agentId", policy.GetPolicy)
			sdk.POST("/policy/:agentId", policy.SetPolicy)
			sdk.GET("/vendor/:domain", vendor.GetVendorStatus)
			sdk.GET("/fleet/status", fleet.GetStats)
			sdk.PATCH("/traces/:id/anchor", anchorHandler.UpdateTraceAnchor)
			sdk.GET("/anchor/verify/:traceId", anchorHandler.VerifyTrace)
			sdk.GET("/anchor/:fleetId/:date", anchorHandler.GetDailyRoot)

			// dWallet + Signing (requires cosigner and pipeline)
			if len(deps) > 0 && deps[0] != nil {
				d := deps[0]
				if d.Cosigner != nil {
					wallets := handler.NewWalletHandler(convex, d.Cosigner)
					sdk.POST("/wallets/create-fleet", wallets.CreateFleet)
					sdk.POST("/wallets/create-agent", wallets.CreateAgentWallet)
					sdk.POST("/wallets/freeze", wallets.FreezeAgent)
					sdk.GET("/wallets/:fleetId", wallets.ListWallets)
					sdk.GET("/wallets/:fleetId/:agentKey", wallets.GetAgentWallet)
				}
				if d.Pipeline != nil {
					signing := handler.NewSigningHandler(convex, d.Pipeline)
					sdk.POST("/signing/request", signing.CreateSigningRequest)
					sdk.GET("/signing/:id", signing.GetSigningRequest)
				}
			}
		}
	}

	return r
}
