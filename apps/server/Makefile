.PHONY: dev build run tidy test test-verbose test-engine test-replay

# Run with hot reload (requires air: go install github.com/air-verse/air@latest)
dev:
	cd cmd/server && air

# Build the binary
build:
	go build -o bin/server ./cmd/server

# Run the binary
run: build
	./bin/server

# Run all tests (skips packages with missing local deps like solana-go)
test:
	go test ./internal/engine/... ./internal/replay/... ./internal/model/... ./internal/chain/...

# Run all tests with verbose output
test-verbose:
	go test -v ./internal/engine/... ./internal/replay/... ./internal/model/... ./internal/chain/...

# Run only engine/rules tests
test-engine:
	go test -v ./internal/engine/...

# Run only replay tests
test-replay:
	go test -v ./internal/replay/...

# Tidy dependencies
tidy:
	go mod tidy
