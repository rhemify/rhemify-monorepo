.PHONY: dev build run tidy

# Run with hot reload (requires air: go install github.com/air-verse/air@latest)
dev:
	cd cmd/server && air

# Build the binary
build:
	go build -o bin/server ./cmd/server

# Run the binary
run: build
	./bin/server

# Tidy dependencies
tidy:
	go mod tidy
