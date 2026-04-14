# Promo Snatcher — CLAUDE.md

Varredor automático de preços (Mercado Livre + Amazon) com envio para grupos WhatsApp.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI + SQLModel + SQLite + APScheduler |
| Scrapers | httpx + BeautifulSoup (ML), crawl4ai/Chromium (Amazon) |
| WhatsApp | WAHA (self-hosted, NOWEB engine) |
| Frontend | React 18 + Vite + TailwindCSS + Recharts |
| Proxy | nginx (frontend + proxy /api/ → backend) |
| Infra | Podman / Docker Compose + Cloudflare Tunnel |
| Auth | JWT via python-jose, senha no .env |

## Estrutura

```
/workspace/target/
├── assets/
│   └── logo.png               # Foto padrão de grupos WA
├── backend/
│   ├── app/
│   │   ├── models.py          # SQLModel: Group, Product, PriceHistory, ScanJob, AppConfig
│   │   ├── schemas.py         # Pydantic schemas
│   │   ├── database.py        # engine, create_db_and_tables(), migrate_db()
│   │   ├── main.py            # FastAPI app, lifespan, _configure_defaults()
│   │   ├── routers/
│   │   │   ├── auth.py        # POST /api/auth/login (JWT)
│   │   │   ├── groups.py      # CRUD + scan + create-wa-group
│   │   │   ├── products.py    # list, delete, send, GET /history
│   │   │   ├── scan.py        # jobs, status
│   │   │   └── config.py      # AppConfig + /wa/qr + /wa/status + /wa/groups
│   │   └── services/
│   │       ├── scanner.py     # scan_group(): ML + Amazon + dedup + WA + price drop
│   │       ├── mercadolivre.py # httpx + BS4 + ML OAuth fallback
│   │       ├── amazon.py      # crawl4ai AsyncWebCrawler (sem wait_for)
│   │       ├── auth.py        # JWT create/verify, require_auth dependency
│   │       └── whatsapp/
│   │           ├── base.py    # WhatsAppAdapter ABC
│   │           ├── waha.py    # WAHAAdapter — provider principal
│   │           ├── evolution.py  # EvolutionAdapter (legado)
│   │           ├── zapi.py    # ZApiAdapter (legado)
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
│   │   │   └── Settings.jsx   # WAHA config + status/QR + grupos + ML OAuth + scan
│   │   └── components/
│   │       ├── GroupCard.jsx  # Card com ScanBadge + wa_group_status
│   │       ├── ProductCard.jsx # Card + gráfico histórico Recharts
│   │       └── ScanStatus.jsx # Scheduler status
│   ├── nginx.conf             # Proxy /api/ + resolver Podman + /evolution/
│   └── Dockerfile             # multi-stage node:20 → nginx:alpine
├── docker-compose.yml
├── Makefile
├── .env.example
└── .gitignore
```

## Comandos rápidos

```bash
make up              # build + sobe em background
make down            # para tudo
make restart         # down + up
make logs            # todos os logs (follow)
make test            # testa health + endpoints via curl
make status          # containers + próximo scan
make scan            # dispara scan manual em todos os grupos
make shell           # bash no backend
make fix-network     # reaplica aliases Podman (rodar se 502 aparecer)
make clean           # remove containers + imagens + volume (pede confirmação)
```

## Variáveis de ambiente (.env)

```env
# Auth JWT
AUTH_USERNAME=admin
AUTH_PASSWORD=senha-aqui          # vazio = desabilita auth
AUTH_SECRET=string-aleatoria-longa
AUTH_TOKEN_HOURS=72

# Scan
SCAN_INTERVAL=30                  # minutos
TZ_NAME=America/Sao_Paulo

# WAHA (WhatsApp)
WAHA_SESSION=default
WAHA_API_KEY=promohunter123       # obrigatório — WAHA exige key
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=promohunter123

# Cloudflare Tunnel
CLOUDFLARE_TOKEN=eyJ...
```

## Portas

| Serviço | Porta local | Externo |
|---------|-------------|---------|
| Backend API | 8000 | via nginx |
| Frontend nginx | 6060 | `snatcher.autibequi.com` |
| WAHA | 3200 | interno |
| WAHA Dashboard | 3200 | `localhost:3200` |

## Modelo de dados

### AppConfig (singleton id=1)
- `wa_provider` — `waha` (default) | `evolution` | `zapi`
- `wa_base_url`, `wa_api_key`, `wa_instance`
- `wa_group_prefix` — prefixo dos grupos WA (default `Snatcher`)
- `send_start_hour / send_end_hour` — janela de envio (default 8-22h)
- `ml_client_id / ml_client_secret` — credenciais ML OAuth
- `amz_tracking_id / ml_affiliate_tool_id` — IDs afiliado
- `global_interval` — intervalo de scan global

### Group
- `search_prompt` — busca no ML/Amazon
- `min_val / max_val` — faixa de preço
- `whatsapp_group_id` — JID do grupo WA (`120363xxx@g.us`)
- `wa_group_status` — `ok | removed | not_found` (health check no scanner)
- `message_template` — template com `{title} {price} {url} {source} {group_name}`
- `scan_interval` — minutos (override do global)

### Product / PriceHistory
- `source` — `mercadolivre | amazon`
- `price` — preço atual (atualizado em qualquer mudança)
- `sent_at` — quando enviado no WA
- PriceHistory: `product_id`, `price`, `recorded_at` — ponto histórico em toda mudança

## WAHA — notas importantes

- **Engine**: NOWEB (Node.js WebSocket) — mais leve, sem Chrome
  - WEBJS suporta foto de grupo mas **não cria grupos** → usar NOWEB
- **API Key obrigatória**: WAHA gera chave aleatória no boot se não definida. Definir `WAHA_API_KEY` no compose para chave fixa
- **Sessão**: `POST /api/sessions` + `POST /api/sessions/default/start`
- **Status**: STOPPED → STARTING → SCAN_QR_CODE → WORKING
- **QR**: `GET /api/{session}/auth/qr?format=image` (NOWEB suporta)
- **Grupos**: endpoint retorna dict `{jid: groupObject}`, não lista
- **Prefixo**: grupos criados como `{wa_group_prefix} - {nome}`, lista filtra pelo prefixo
- **Volume corrompido**: trocar entre NOWEB/WEBJS corrompe o volume — apagar e recriar

## Scanner — fluxo principal

```
scan_group(group_id)
  ├── config = AppConfig
  ├── ml_results = mercadolivre.search()    # API oficial ou scraping HTML
  ├── amz_results = amazon.search()         # crawl4ai + Chromium (sem wait_for)
  ├── existing = {url: Product} para dedup
  ├── wa_adapter.check_group() → wa_group_status (ok/removed)
  └── para cada result:
      ├── novo: insert + PriceHistory + envio WA (se dentro da send window)
      └── existente com queda ≥10%:
              → PriceHistory + re-envio com badge 🚨 + update price
```

## Scrapers

### Mercado Livre
- URL: `https://lista.mercadolivre.com.br/{slug}_PriceRange_{min}-{max}_NoIndex_True`
- Parser: BS4, seletor `div.poly-card--grid-card`
- URL do produto: regex `MLB\d+` → `https://www.mercadolivre.com.br/p/{ID}`
- Fallback → scraping HTML quando OAuth não configurado

### Amazon
- crawl4ai `AsyncWebCrawler` com Chromium headless
- `simulate_user=True`, `magic=True`, `--no-sandbox`, `--disable-dev-shm-usage`
- **Sem `wait_for`** — `delay_before_return_html=2.0` suficiente
- Seletores: `h2 span` (título), `a[href*="/dp/"]` (link), `.a-price-whole` (preço)

## Auth

- `POST /api/auth/login` → JWT 72h
- Todas rotas protegidas exceto `/api/health` e `/api/auth/login` e `/api/config/wa/qr`
- `/api/config/wa/qr` é público (HTML com QR — sem dados sensíveis)
- `AUTH_PASSWORD` vazio = desabilitado

## nginx — gotchas

- Resolver Podman: `resolver 10.89.4.1 valid=10s` (**não** `127.0.0.11` do Docker)
- Proxy com variável: `set $backend http://promo-snatcher-backend:8000; proxy_pass $backend$request_uri`
- Sem variável: nginx cacheia IP no startup, 502 quando container reinicia

## Podman — gotchas

- Aliases de rede se perdem quando containers reiniciam → `make fix-network`
- Container names explícitos no compose (`container_name: promo-snatcher-*`) resolvem DNS sem alias
- `resolver 10.89.4.1` no nginx garante resolução dinâmica

## Cloudflare Tunnel

- Container: `promo-snatcher-cloudflared`
- Rotas em: Zero Trust → Networks → Tunnels → Promo Snatcher → Rotas de aplicativo publicadas
- DNS CNAMEs criados manualmente (nova UI não cria auto)
- `snatcher.autibequi.com` → `http://promo-snatcher-frontend:80`

## Roadmap (Obsidian: `/workspace/obsidian/projects/ongoing/promo-snatcher/`)

### Concluído
- [x] MVP: CRUD grupos, scraping ML, WA adapter, scheduler
- [x] Amazon via crawl4ai (fix: sem wait_for)
- [x] Price drop alerts (≥10%)
- [x] Templates de mensagem com variáveis
- [x] Histórico de preços + gráfico Recharts inline
- [x] Agendamento por horário (send window)
- [x] Auth ML OAuth com fallback HTML
- [x] Docker + Makefile + healthchecks
- [x] Cloudflare Tunnel (snatcher.autibequi.com)
- [x] Auth JWT (login page + rotas protegidas)
- [x] WAHA como provider principal (migrou de Evolution API)
- [x] Gestão de grupos WA: criar (com prefixo), listar, filtrar, vincular
- [x] Foto de grupo (NOWEB não suporta; WEBJS cria grupos — trade-off atual)
- [x] Logout WA (sessão WAHA)
- [x] Health check wa_group_status no scanner
- [x] Afiliados ML + Amazon nos links enviados

### Próximo
- [ ] Envio de imagem WA nas mensagens
- [ ] Multi-tenant + auth por usuário
- [ ] PostgreSQL para o backend (hoje SQLite)
- [ ] Celery/RQ para scans assíncronos
- [ ] Stripe cobrança (SaaS)
