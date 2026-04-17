# =============================================================================
# Multi-stage: base (libs + Chromium + pip) → imagem final com app.
# Local / make dev: build completo, sem pull do ghcr.
# CI prod: push da camada base — make build-base / workflow build-base.yml (--target base)
# =============================================================================
FROM python:3.11-slim AS base

# System libs for headless Chromium (Debian 12 bookworm)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget curl gnupg ca-certificates \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    libx11-xcb1 \
    libxss1 \
    libasound2 \
 && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN pip install --no-cache-dir playwright crawl4ai \
 && (python -m playwright install --with-deps chromium || crawl4ai-setup)

COPY requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt

WORKDIR /app

# --- app (default target) ---
FROM base

WORKDIR /app

COPY . .

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
