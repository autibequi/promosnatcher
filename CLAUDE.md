# Promo Hunter — CLAUDE.md

Varredor automático de preços (Mercado Livre + Amazon) com envio para grupos WhatsApp.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI + SQLModel + SQLite + APScheduler |
| Scrapers | httpx + BeautifulSoup (ML), crawl4ai/Chromium (Amazon) |
| WhatsApp | Evolution API v2 (self-hosted) ou Z-API (SaaS) |
| Frontend | React 18 + Vite + TailwindCSS + Recharts |
| Proxy | nginx (frontend + proxy /api/ → backend) |
| Infra | Podman / Docker Compose + Cloudflare Tunnel |
| Auth | JWT via python-jose, senha no .env |

## Estrutura

```
/workspace/target/
├── backend/
│   ├── app/
│   │   ├── models.py          # SQLModel: Group, Product, PriceHistory, ScanJob, AppConfig
│   │   ├── schemas.py         # Pydantic schemas
│   │   ├── database.py        # engine, create_db_and_tables(), migrate_db()
│   │   ├── main.py            # FastAPI app, lifespan, _configure_defaults()
│   │   ├── routers/
│   │   │   ├── auth.py        # POST /api/auth/login
│   │   │   ├── groups.py      # CRUD + scan + create-wa-group
│   │   │   ├── products.py    # list, delete, send, GET /history
│   │   │   ├── scan.py        # jobs, status
│   │   │   └── config.py      # AppConfig + GET /wa/qr
│   │   └── services/
│   │       ├── scanner.py     # scan_group(): ML + Amazon + dedup + WA + price drop
│   │       ├── mercadolivre.py # httpx + BS4 + ML OAuth fallback
│   │       ├── amazon.py      # crawl4ai AsyncWebCrawler
│   │       ├── auth.py        # JWT create/verify, require_auth dependency
│   │       └── whatsapp/
│   │           ├── base.py    # WhatsAppAdapter ABC
│   │           ├── evolution.py  # EvolutionAdapter (check_group, create_group com retry)
│   │           ├── zapi.py    # ZApiAdapter
│   │           └── factory.py
│   ├── data/                  # SQLite DB (gitignored, .gitkeep presente)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Auth gate + Nav com logout
│   │   ├── api.js             # axios + interceptors JWT + 401 redirect
│   │   ├── pages/
│   │   │   ├── Login.jsx      # Login page
│   │   │   ├── Dashboard.jsx  # Lista de grupos
│   │   │   ├── GroupDetail.jsx # Produtos + histórico + criar grupo WA
│   │   │   ├── GroupForm.jsx  # Criar/editar grupo (inclui message_template)
│   │   │   └── Settings.jsx   # WA config + ML OAuth + send window
│   │   └── components/
│   │       ├── GroupCard.jsx  # Card com ScanBadge + wa_group_status
│   │       ├── ProductCard.jsx # Card + gráfico histórico Recharts
│   │       └── ScanStatus.jsx # Scheduler status
│   ├── nginx.conf             # Proxy /api/ + /evolution/ + resolver Podman
│   └── Dockerfile             # multi-stage node:20 → nginx:alpine
├── docker-compose.yml
├── Makefile
├── .env.example
└── .gitignore
```

## Comandos rápidos

```bash
# Subir stack completa
make up

# Logs
make logs           # todos
make logs-backend   # só backend
make logs-frontend  # só frontend

# Testar saúde
make test

# Scan manual de todos os grupos
make scan

# Se aparecer 502 (aliases Podman caindo)
make fix-network

# Shell no backend
make shell
```

## Variáveis de ambiente (.env)

```env
# Auth JWT
AUTH_USERNAME=admin
AUTH_PASSWORD=senha-aqui          # deixar vazio desabilita auth
AUTH_SECRET=string-aleatoria-longa
AUTH_TOKEN_HOURS=72

# Scan
SCAN_INTERVAL=30                  # minutos entre scans automáticos
TZ_NAME=America/Sao_Paulo         # fuso para send window

# WhatsApp / Evolution API
EVOLUTION_API_KEY=promohunter123
EVOLUTION_DB_PASS=evolution123
EVOLUTION_INSTANCE=promo-hunter
EVOLUTION_SERVER_URL=http://localhost:8181  # ou https://z-evo.seu-dominio.com

# Cloudflare Tunnel
CLOUDFLARE_TOKEN=eyJ...

# ML OAuth (opcional — sem isso usa scraping HTML)
# ML_CLIENT_ID e ML_CLIENT_SECRET via Settings no frontend
```

## Portas

| Serviço | Porta local | Externo |
|---------|-------------|---------|
| Backend API | 8000 | via nginx |
| Frontend nginx | 6060 | `snatcher.autibequi.com` |
| Evolution Manager | 6061 | (nginx porta 8081) |
| Evolution API | 8181 | `snatcher.autibequi.com/evolution/` |
| Evolution Manager | — | `snatcher.autibequi.com/manager` |

## Modelo de dados

### Group
- `search_prompt` — busca no ML/Amazon
- `min_val / max_val` — faixa de preço
- `whatsapp_group_id` — JID do grupo WA (`120363xxx@g.us`)
- `wa_group_status` — `ok | removed | not_found` (health check no scanner)
- `message_template` — template customizável com `{title} {price} {url} {source} {group_name}`
- `scan_interval` — minutos entre scans (override do global)

### Product
- `source` — `mercadolivre | amazon`
- `price` — preço atual (atualizado em drops)
- `sent_at` — quando foi enviado no WA (null = não enviado)

### PriceHistory
- `product_id` → Product
- `price`, `recorded_at` — ponto histórico (registrado em toda mudança)

### AppConfig (singleton id=1)
- `wa_provider` — `evolution | zapi`
- `wa_base_url`, `wa_api_key`, `wa_instance`
- `send_start_hour / send_end_hour` — janela de envio WA (default 8-22h)
- `ml_client_id / ml_client_secret` — credenciais ML OAuth
- `global_interval` — intervalo de scan global

## Scanner — fluxo principal

```
scan_group(group_id)
  ├── config = AppConfig
  ├── ml_results = mercadolivre.search()    # API oficial ou scraping HTML
  ├── amz_results = amazon.search()         # crawl4ai + Chromium
  ├── existing = {url: Product} para dedup
  ├── wa_adapter.check_group() → wa_group_status
  └── para cada result:
      ├── novo: insert + PriceHistory + envio WA (se dentro da send window)
      └── existente com queda ≥10%:
              → insert PriceHistory + re-envio com badge 🚨 + update price
```

## Scrapers

### Mercado Livre
- URL: `https://lista.mercadolivre.com.br/{slug}_PriceRange_{min}-{max}_NoIndex_True`
- Parser: BS4, seletor `div.poly-card--grid-card`
- URL do produto: ID `MLB\d+` extraído do HTML → `https://www.mercadolivre.com.br/p/{ID}`
- OAuth: se `ml_client_id` configurado usa `GET /sites/MLB/search` com Bearer token

### Amazon
- crawl4ai `AsyncWebCrawler` com Chromium headless
- `simulate_user=True`, `magic=True`, `--disable-blink-features=AutomationControlled`
- Seletores: `h2 span` (título), `a[href*="/dp/"]` (link), `.a-price-whole` (preço)
- Sem `wait_for` — `delay_before_return_html=2.0` é suficiente

## Evolution API — notas importantes

- **Versão WA hardcoded**: Evolution v2.2.3 tem `CONFIG_SESSION_PHONE_VERSION=2.3000.1015901307` (desatualizada). Override no compose: `CONFIG_SESSION_PHONE_VERSION=2.3000.1035194821`
- **Redis obrigatório**: v2 usa Redis para pub/sub de QR codes
- **PostgreSQL obrigatório**: v2 não suporta SQLite
- **create_group**: Evolution valida participantes via `onWhatsApp()` — pode dar timeout em sessões novas. O endpoint usa BackgroundTask e retorna 202.
- **check_group**: `GET /group/findGroupInfos/{instance}?groupJid=xxx` — 200=ok, 404=removido
- **QR code**: `GET /api/config/wa/qr` retorna HTML com QR para escanear

## nginx — gotchas

- Resolver Podman: `resolver 10.89.4.1 valid=10s` (Docker usa `127.0.0.11`)
- Proxy com variável: `set $backend http://promo-hunter-backend:8000; proxy_pass $backend$request_uri;` — necessário para DNS dinâmico
- Sem variável: nginx cacheia IP no startup, 502 quando container reinicia

## Podman — gotchas

- Aliases de rede se perdem quando containers reiniciam
- `make fix-network` reaplica aliases (temporário)
- Solução permanente: `container_name` explícito + nginx resolve pelo nome completo

## Auth

- `POST /api/auth/login` — retorna JWT 72h
- Todas as rotas protegidas exceto `/api/health` e `/api/auth/login`
- `AUTH_PASSWORD` vazio = auth desabilitado
- Frontend: token em `localStorage.getItem('ph_token')`, interceptor axios injeta `Authorization: Bearer`

## Cloudflare Tunnel

- Container: `promo-hunter-cloudflared`
- Rotas configuradas em: Zero Trust → Networks → Tunnels → Promo Snatcher → Rotas de aplicativo publicadas
- DNS CNAMEs precisam ser criados manualmente (nova UI não cria automaticamente)
- `snatcher.autibequi.com` → `http://promo-hunter-frontend:80`
- Subdomínios de 2 níveis (ex: `promo.snatcher.autibequi.com`) não são cobertos pelo wildcard free

## Roadmap (Obsidian: `/workspace/obsidian/projects/ongoing/promo-hunter/`)

### Concluído (Semana 1-2)
- [x] MVP: CRUD grupos, scraping ML, WA adapter, scheduler
- [x] Amazon via crawl4ai
- [x] Price drop alerts (≥10%)
- [x] Templates de mensagem
- [x] Histórico de preços + gráfico Recharts
- [x] Agendamento por horário (send window)
- [x] Auth ML OAuth com fallback HTML
- [x] Docker + Makefile
- [x] Cloudflare Tunnel
- [x] Auth JWT
- [x] Auto-criação grupo WA + health check

### Próximo (Semana 3-4)
- [ ] Envio de imagem WA
- [ ] Multi-tenant + auth por usuário
- [ ] PostgreSQL para o backend (hoje SQLite)
- [ ] Celery/RQ para scans assíncronos
- [ ] Stripe cobrança (SaaS)
