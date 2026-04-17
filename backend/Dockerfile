# =============================================================================
# App image: just copies code into the pre-built base.
# Build time: ~5s (vs ~15-30min with full deps)
#
# Base image must exist: ghcr.io/autibequi/promosnatcher-base:latest
# Rebuild base with: make build-base (or CI triggers on requirements.txt change)
# =============================================================================
FROM ghcr.io/autibequi/promosnatcher-base:latest

WORKDIR /app

COPY . .

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
