# Promo Snatcher — CLAUDE.md

Varredor automático de preços (Mercado Livre + Amazon) com pipeline de 3 camadas e envio inteligente para **WhatsApp + Telegram**.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI + SQLModel + SQLite + APScheduler |
| Scrapers | httpx + BeautifulSoup (ML), crawl4ai/Chromium (Amazon) |
| Messaging | WhatsApp via Evolution API + Telegram via python-telegram-bot 21.6 |
| Frontend | React 18 + Vite + TailwindCSS + Recharts |
| Infra | Docker Compose + Cloudflare Tunnel |
| Auth | JWT via python-jose |

## Arquitetura — Pipeline v2

```
CRAWL  →  CATALOG  →  DELIVER

SearchTerm → CrawlResult → CatalogProduct/Variant → Channel(Rules) → WA/TG
```

### Layer 1: CRAWL
- **SearchTerm**: query, price range, sources, interval
- **CrawlResult**: resultado bruto (título, preço, URL, source)

### Layer 2: CATALOG
- **CatalogProduct**: produto canônico (canonical_name, brand, weight, tags, lowest_price)
- **CatalogVariant**: URL/sabor/cor individual (preço, source)
- **GroupingKeyword**: auto-tag (keyword → tag)
- **PriceHistoryV2**: histórico por variante

### Layer 3: DELIVER
- **Channel**: nome, template, send window
- **ChannelTarget**: WA group ou TG chat
- **ChannelRule**: match (tag/brand/search_term/all) + triggers (new/drop/lowest)
- **SentMessageV2**: dedup por (product, target)

## Estrutura

```
backend/app/
├── models.py              # SQLModel: pipeline v2 + legacy v1
├── schemas.py             # Pydantic: v2 schemas
├── database.py            # engine, migrations
├── main.py                # FastAPI app, lifespan
├── routers/
│   ├── search_terms.py    # CRUD + crawl manual + results
│   ├── catalog.py         # products + variants + keywords
│   ├── channels.py        # channels + targets + rules
│   ├── scan.py            # scheduler status + pipeline trigger
│   ├── config.py          # AppConfig + WA QR/status
│   ├── telegram.py        # TG discovery + linking
│   └── public.py          # frontpage channel listing
└── services/
    ├── pipeline.py        # crawl → process → evaluate
    ├── normalize.py       # normalize_title, extract_brand/weight
    ├── scheduler.py       # APScheduler: pipeline + tg_poll
    ├── mercadolivre.py    # ML scraper
    ├── amazon.py          # AMZ scraper (crawl4ai)
    ├── telegram_poller.py # TG getUpdates discovery
    ├── migrate_v2.py      # Group/Product → v2 migration
    └── whatsapp/          # adapters (evolution, telegram)

frontend/src/
├── App.jsx                # ErrorBoundary + routes + nav
├── api.js                 # all API functions
└── pages/
    ├── Dashboard.jsx      # stats + analytics charts
    ├── Crawlers.jsx       # SearchTerm list
    ├── CrawlerDetail.jsx  # detail + results + crawl manual
    ├── Catalog.jsx        # products + variants + sparklines + keywords
    ├── Channels.jsx       # channel list
    ├── ChannelDetail.jsx  # targets + rules + catalog preview
    └── Settings.jsx       # WA/TG config
```

## Pipeline

```
run_pipeline()
  ├── crawl_all_terms()          # SearchTerm → CrawlResult
  ├── process_crawl_results()    # CrawlResult → CatalogProduct/Variant + auto-tag
  └── evaluate_channels()        # ChannelRule + _detect_events() → send WA/TG
```

### Detecção de eventos (evaluate)
- **new**: variant.first_seen < 3h
- **drop**: preço caiu ≥ threshold vs PriceHistoryV2 anterior
- **lowest**: preço atual = min(todo histórico)

### Normalização de títulos
```
"Nutri Whey Protein Chocolate Pote 900g Integralmédica"
→ "nutri whey protein integralmedica"
```
Remove: acentos, parênteses, peso, embalagem, sabores/cores.
Fuzzy: SequenceMatcher ≥ 0.80 entre canonical_names.

## Comandos

```bash
make dev         # Dev mode (hot-reload)
make start       # Produção
make update      # git pull + rebuild
make logs        # Logs follow
make status      # Container status + scheduler
```

## Variáveis (.env)

```env
AUTH_USERNAME, AUTH_PASSWORD, AUTH_SECRET
SCAN_INTERVAL=30, TZ_NAME=America/Sao_Paulo
EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_API_KEY
TG_BOT_TOKEN
CLOUDFLARE_TOKEN
```
