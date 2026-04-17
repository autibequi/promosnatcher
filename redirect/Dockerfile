# Build stage: roda na arch do host (x86) — Go cross-compila nativamente
FROM --platform=$BUILDPLATFORM golang:1.22-alpine AS build

ARG TARGETOS TARGETARCH

WORKDIR /app

COPY go.mod ./
RUN --mount=type=cache,target=/root/go/pkg/mod \
    go mod download

COPY . .
# CGO_ENABLED=0: binario estatico puro
# GOOS/GOARCH: cross-compile nativo (sem QEMU)
RUN --mount=type=cache,target=/root/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -mod=mod -ldflags="-s -w" -o redirect .

# ---------------------------------------------------------------------------
# Imagem final: alpine ~11MB — permite healthcheck com wget
# ---------------------------------------------------------------------------
FROM alpine:3.20

COPY --from=build /app/redirect /redirect

EXPOSE 8081

ENTRYPOINT ["/redirect"]
