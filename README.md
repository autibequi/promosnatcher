# Promo Hunter

Varredor de preços (Mercado Livre + Amazon) com gerenciamento de grupos WhatsApp.

## Estrutura

```
backend/    FastAPI + SQLite + APScheduler
frontend/   React + Vite + TailwindCSS
```

## Rodar em dev

**Backend:**
```bash
cd backend
uv venv .venv && uv pip install -r requirements.txt
cp .env.example .env   # edite com suas configs
uv run uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

## Rodar com Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
```

## Configuração WhatsApp

No site, acesse **Configurações** e preencha:

| Campo | Descrição |
|---|---|
| Provider | `evolution` (self-hosted) ou `zapi` (SaaS) |
| Base URL | URL da sua instância (ex: `http://localhost:8080`) |
| API Key | Chave de autenticação |
| Instance ID | Nome/ID da instância |

### Evolution API
Instale em: https://github.com/EvolutionAPI/evolution-api

### Z-API
Crie conta em: https://z-api.io

## Grupos

Cada grupo tem:
- **search_prompt** — descrição do produto a buscar (ex: `whey protein isolado 900g`)
- **min_val / max_val** — faixa de preço em R$
- **whatsapp_group_id** — ID do grupo WA para envio automático (opcional)

O scanner roda a cada 30min (configurável). Novos produtos são enviados automaticamente ao grupo WA se configurado.

## API

Documentação interativa: `http://localhost:8000/docs`
