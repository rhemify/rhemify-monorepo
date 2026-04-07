package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port              string
	CORSOrigin        string
	ConvexURL         string
	ConvexDeployKey   string
	SolanaRPCURL       string
	CosignerPrivateKey string
	DWalletProgramID   string
	IkaSidecarURL      string
	IkaSidecarSecret   string
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		Port:               getEnv("PORT", "8080"),
		CORSOrigin:         getEnv("CORS_ORIGIN", "http://localhost:3001"),
		ConvexURL:          getEnv("CONVEX_URL", ""),
		ConvexDeployKey:    getEnv("CONVEX_DEPLOY_KEY", ""),
		SolanaRPCURL:       getEnv("SOLANA_RPC_URL", "https://api.devnet.solana.com"),
		CosignerPrivateKey: getEnv("COSIGNER_PRIVATE_KEY", ""),
		DWalletProgramID:   getEnv("DWALLET_PROGRAM_ID", ""),
		IkaSidecarURL:      getEnv("IKA_SIDECAR_URL", "http://localhost:3002"),
		IkaSidecarSecret:   getEnv("IKA_SIDECAR_SECRET", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
