.PHONY: dev build run migrate-up migrate-down migrate-create tidy

# Run the server with hot reload (requires air: go install github.com/air-verse/air@latest)
dev:
	cd cmd/server && air

# Build the binary
build:
	go build -o bin/server ./cmd/server

# Run the binary
run: build
	./bin/server

# Run migrations up
migrate-up:
	go run ./cmd/migrate up

# Run migrations down (1 step)
migrate-down:
	go run ./cmd/migrate down

# Create a new migration: make migrate-create name=add_something
migrate-create:
	@if [ -z "$(name)" ]; then echo "Usage: make migrate-create name=<migration_name>"; exit 1; fi
	@num=$$(printf "%06d" $$(($$(ls migrations/*.up.sql 2>/dev/null | wc -l) + 1))); \
	touch "migrations/$${num}_$(name).up.sql" "migrations/$${num}_$(name).down.sql"; \
	echo "Created migrations/$${num}_$(name).up.sql and .down.sql"

# Tidy dependencies
tidy:
	go mod tidy
