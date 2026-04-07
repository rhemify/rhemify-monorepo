package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	solanago "github.com/gagliardetto/solana-go"
	"github.com/rhemify/server/internal/chain"
	"github.com/rhemify/server/internal/config"
	cx "github.com/rhemify/server/internal/convex"
	"github.com/rhemify/server/internal/ika"
	"github.com/rhemify/server/internal/router"
	"github.com/rhemify/server/internal/signer"
	solclient "github.com/rhemify/server/internal/solana"
)

func main() {
	cfg := config.Load()

	if cfg.ConvexURL == "" {
		log.Fatal("CONVEX_URL is required")
	}

	client := cx.NewClient(cfg.ConvexURL, cfg.ConvexDeployKey)

	// Initialize dWallet dependencies (optional — gracefully skip if not configured)
	var deps *router.Deps
	if cfg.CosignerPrivateKey != "" && cfg.DWalletProgramID != "" {
		solClient := solclient.NewSolanaClient(cfg.SolanaRPCURL)

		privKey, err := solanago.PrivateKeyFromBase58(cfg.CosignerPrivateKey)
		if err != nil {
			log.Fatalf("invalid COSIGNER_PRIVATE_KEY: %v", err)
		}
		programID, err := solanago.PublicKeyFromBase58(cfg.DWalletProgramID)
		if err != nil {
			log.Fatalf("invalid DWALLET_PROGRAM_ID: %v", err)
		}

		cosigner := signer.NewCosigner(solClient, privKey, programID)

		registry := chain.NewChainRegistry(
			chain.NewBaseAdapter("https://sepolia.base.org"),
		)

		// Initialize Ika sidecar client (optional)
		var ikaClient *ika.Client
		if cfg.IkaSidecarURL != "" {
			ikaClient = ika.NewClient(cfg.IkaSidecarURL, cfg.IkaSidecarSecret)
			log.Printf("Ika sidecar configured: %s", cfg.IkaSidecarURL)
		}

		pipeline := signer.NewSigningPipeline(
			&signer.ValidateStage{},
			&signer.PolicyCheckStage{},
			&signer.IntelligenceStage{},
			&signer.ApproveOnChainStage{Cosigner: cosigner, IkaClient: ikaClient},
			&signer.MonitorIkaStage{IkaClient: ikaClient},
			&signer.BroadcastStage{Registry: registry},
			&signer.SettlementStage{},
		)

		deps = &router.Deps{
			Cosigner:  cosigner,
			Pipeline:  pipeline,
			IkaClient: ikaClient,
		}
		log.Printf("dWallet co-signer initialized: %s", cosigner.PublicKey())

		// Start balance syncer in background
		syncerCtx, syncerCancel := context.WithCancel(context.Background())
		syncer := chain.NewBalanceSyncer(registry, client, 30*time.Second)
		go syncer.Start(syncerCtx)
		defer syncerCancel()
	} else {
		log.Println("dWallet co-signer not configured (COSIGNER_PRIVATE_KEY or DWALLET_PROGRAM_ID missing)")
	}

	r := router.Setup(client, cfg, deps)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	go func() {
		log.Printf("server listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}
	log.Println("server exited")
}
