FROM golang:1.22-alpine AS build

WORKDIR /app

COPY go.mod ./
# Baixa dependências com cache entre builds
RUN --mount=type=cache,target=/root/go/pkg/mod \
    go mod download

COPY . .
# CGO_ENABLED=0: binário estático puro (funciona em scratch + ARM64 sem CGO)
RUN --mount=type=cache,target=/root/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -mod=mod -ldflags="-s -w" -o redirect .

# ---------------------------------------------------------------------------
# Imagem final: alpine ~11MB — permite healthcheck com wget
# ---------------------------------------------------------------------------
FROM alpine:3.20

COPY --from=build /app/redirect /redirect

EXPOSE 8081

ENTRYPOINT ["/redirect"]
