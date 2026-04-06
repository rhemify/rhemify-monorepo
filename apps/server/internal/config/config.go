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
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		Port:            getEnv("PORT", "8080"),
		CORSOrigin:      getEnv("CORS_ORIGIN", "http://localhost:3001"),
		ConvexURL:       getEnv("CONVEX_URL", ""),
		ConvexDeployKey: getEnv("CONVEX_DEPLOY_KEY", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
