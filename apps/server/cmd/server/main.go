package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"context"
	"time"

	"github.com/rhemify/server/internal/config"
	cx "github.com/rhemify/server/internal/convex"
	"github.com/rhemify/server/internal/router"
)

func main() {
	cfg := config.Load()

	if cfg.ConvexURL == "" {
		log.Fatal("CONVEX_URL is required")
	}

	client := cx.NewClient(cfg.ConvexURL, cfg.ConvexDeployKey)

	r := router.Setup(client, cfg)

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
