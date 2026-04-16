# Promo Snatcher — CLAUDE.md

Varredor automático de preços (Mercado Livre + Amazon) com envio para grupos **WhatsApp + Telegram**.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI + SQLModel + SQLite + APScheduler |
| Scrapers | httpx + BeautifulSoup (ML), crawl4ai/Chromium (Amazon) |
| WhatsApp | WAHA (self-hosted, NOWEB engine) |
| Telegram | python-telegram-bot 21.6 (async Bot API) |
| Frontend | React 18 + Vite + TailwindCSS + Recharts |
| Proxy | nginx (frontend + proxy /api/ → backend) |
| Infra | Docker / Podman Compose + Cloudflare Tunnel |
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
│   │   │   ├── config.py      # AppConfig + /wa/qr + /wa/status + /wa/groups
│   │   │   └── telegram.py    # /config/tg/* — discovery, linking, status
│   │   └── services/
│   │       ├── scanner.py     # scan_group(): ML + Amazon + multi-provider fanout + dedup
│   │       ├── mercadolivre.py # httpx + BS4 + ML OAuth fallback
│   │       ├── amazon.py      # crawl4ai AsyncWebCrawler (sem wait_for)
│   │       ├── auth.py        # JWT create/verify, require_auth dependency
│   │       ├── telegram_poller.py  # tg_poll_updates() — discovery via polling
│   │       └── whatsapp/
│   │           ├── base.py    # WhatsAppAdapter ABC
│   │           ├── waha.py    # WAHAAdapter — provider principal
│   │           ├── evolution.py  # EvolutionAdapter (legado)
│   │           ├── telegram.py # TelegramAdapter — telegram Bot API
│   │           └── factory.py  # get_adapter() + get_tg_adapter()
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
make setup           # cria .env + gera AUTH_SECRET automático
make start           # build + sobe (sem Cloudflare Tunnel)
make start-tunnel    # build + sobe + Cloudflare Tunnel
make pi-setup        # Raspberry Pi: instala Docker + configura swap 2GB
make up              # sobe em background (sem rebuild)
make down            # para tudo
make logs            # todos os logs (follow)
make test            # testa health + endpoints via curl
make status          # containers + próximo scan
make scan            # dispara scan manual em todos os grupos
make shell           # bash no backend
make clean           # remove containers + imagens + volume (pede confirmação)
```

## Variáveis de ambiente (.env)

```env
# Auth JWT
AUTH_USERNAME=admin
AUTH_PASSWORD=senha-aqui          # obrigatório
AUTH_SECRET=                      # gerado automaticamente pelo make setup
AUTH_TOKEN_HOURS=72

# WhatsApp (Evolution API)
EVOLUTION_API_KEY=senha-forte     # obrigatório — chave da API interna
EVOLUTION_INSTANCE=default
EVOLUTION_DB_PASS=evolution       # senha Postgres interno

# URL pública (usada nos short links das mensagens)
PUBLIC_URL=https://snatcher.autibequi.com

# Infraestrutura
FRONTEND_PORT=6060                # porta local do frontend

# Cloudflare Tunnel (opcional — só para acesso externo)
CLOUDFLARE_TOKEN=                 # usar make start-tunnel se definido

# Scan
SCAN_INTERVAL=30                  # minutos
TZ_NAME=America/Sao_Paulo

# Telegram (opcional — tudo configurável pelo painel)
TG_BOT_TOKEN=                     # 123456:ABC...
```

## Portas

| Serviço | Porta local | Externo |
|---------|-------------|---------|
| Frontend nginx | 6060 (configurável) | `snatcher.autibequi.com` |
| Backend API | 8000 | via nginx |
| Evolution API | 3200 (localhost only) | interno |

## Raspberry Pi

O compose está otimizado para ARM64 com:
- `platform: linux/arm64` nas imagens de terceiros
- `shm_size: 128mb` no backend (necessário para Chromium não crashar)
- Limites de memória por container (~1.85 GB total)
- Postgres tunado para baixo consumo (`shared_buffers=32MB`, `max_connections=20`)
- `start_period: 60s` nos healthchecks (Pi demora mais para subir)
- `restart: unless-stopped` em todos os serviços + `systemctl enable docker` = sobrevive a reboots

Fluxo de setup no Pi:
```bash
sudo make pi-setup   # instala Docker + swap 2GB
newgrp docker
make setup && nano .env && make start
```

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

## Scanner — fluxo multi-provider

```
scan_group(group_id)
  ├── config = AppConfig
  ├── ml_results = mercadolivre.search()    # API oficial ou scraping HTML
  ├── amz_results = amazon.search()         # crawl4ai + Chromium (sem wait_for)
  ├── existing = {url: Product} para dedup
  ├── _collect_adapters(config, group) → [(provider, adapter, chat_ids), ...]
  │   ├── whatsapp (se wa configurado + group.whatsapp_group_id)
  │   └── telegram (se tg configurado + group.telegram_chat_id)
  ├── health check pra cada provider → atualiza wa_group_status / tg_group_status
  └── para cada result:
      ├── novo: insert + PriceHistory + fanout multi-provider com dedup
      │         (WA + TG, com registro em SentMessage)
      └── existente com queda ≥10%:
              → PriceHistory + re-envio com badge 🚨 + update price
              → drops sempre re-enviam (is_drop=True ignora dedup)
```

## Dedup multi-provider — SentMessage

**Modelo**: `SentMessage(product_id, provider, chat_id, is_drop)`

**Regra**:
- Se `is_drop=False` e já existe envio anterior para `(provider, chat_id)` → **skip** (dedup)
- Se `is_drop=True` → sempre envia e registra (drops sempre re-enviam)
- Cada provider/chat_id tem histórico separado — TG não é afetado por dedup WA

## Telegram Integration

### Estrutura
- **Models**: `AppConfig` com campos `tg_enabled`, `tg_bot_token`, `tg_bot_username`, `tg_group_prefix`, `tg_last_update_id`
- **Models**: `Group` com campos `telegram_chat_id`, `tg_group_status`
- **Models**: `TelegramChat` para discovery cache (descoberto via polling)
- **Models**: `SentMessage` para dedup robusto (product_id, provider, chat_id, is_drop)
- **Router**: `/api/config/tg/*` — status, test, chats, linking, discovery, deeplink
- **Adapter**: `TelegramAdapter(WhatsAppAdapter)` — send_text, send_image, check_group, etc
- **Poller**: `tg_poll_updates()` executado a cada 30s via APScheduler
- **Factory**: `get_tg_adapter(config)` — cria adapter se token configurado

### Fluxo discovery
1. **Polling**: APScheduler executa `tg_poll_updates()` a cada 30s
2. **getUpdates**: Bot recebe eventos de grupos/canais (my_chat_member, message, channel_post)
3. **Cache**: TelegramChat é populado com metadados (tipo, título, is_admin, etc)
4. **UI**: Lista de chats não-vinculados → frontend permite vincular a um Group
5. **Linking**: Deep-link `tg://resolve?domain={bot}?startgroup=true` pra adicionar bot novo

### Detalhe: HTML parser para Telegram
- Template WA usa markdown: `*bold*`, `_italic_`
- Telegram usa parse_mode=HTML: `<b>bold</b>`, `<i>italic</i>`
- Função `_to_html()` converte WA markdown → HTML (escapa <>&, depois reconverte *...*)
- Resultado: mesma template, diferente parse mode por provider

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
