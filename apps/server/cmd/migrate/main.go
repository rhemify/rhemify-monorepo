package main

import (
	"fmt"
	"log"
	"os"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/rhemify?sslmode=disable"
	}

	if len(os.Args) < 2 {
		fmt.Println("Usage: go run ./cmd/migrate [up|down|version|force N]")
		os.Exit(1)
	}

	m, err := migrate.New("file://migrations", dbURL)
	if err != nil {
		log.Fatalf("failed to create migrate instance: %v", err)
	}
	defer m.Close()

	cmd := os.Args[1]
	switch cmd {
	case "up":
		if err := m.Up(); err != nil && err != migrate.ErrNoChange {
			log.Fatalf("migrate up failed: %v", err)
		}
		fmt.Println("migrations applied successfully")

	case "down":
		if err := m.Steps(-1); err != nil {
			log.Fatalf("migrate down failed: %v", err)
		}
		fmt.Println("rolled back 1 migration")

	case "version":
		v, dirty, err := m.Version()
		if err != nil {
			log.Fatalf("failed to get version: %v", err)
		}
		fmt.Printf("version: %d, dirty: %v\n", v, dirty)

	case "force":
		if len(os.Args) < 3 {
			log.Fatal("force requires a version number")
		}
		var version int
		if _, err := fmt.Sscanf(os.Args[2], "%d", &version); err != nil {
			log.Fatalf("invalid version: %v", err)
		}
		if err := m.Force(version); err != nil {
			log.Fatalf("force failed: %v", err)
		}
		fmt.Printf("forced to version %d\n", version)

	default:
		fmt.Printf("unknown command: %s\n", cmd)
		fmt.Println("Usage: go run ./cmd/migrate [up|down|version|force N]")
		os.Exit(1)
	}
}
