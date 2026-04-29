BINARY = backendv2
CMD    = ./cmd/server

.PHONY: build run tidy test

build:
	go build -o $(BINARY) $(CMD)

run:
	go run $(CMD)

tidy:
	go mod tidy

test:
	go test ./...
