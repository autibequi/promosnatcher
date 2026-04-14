# Promo Hunter — Makefile
# Detecta docker compose v2 ou podman-compose
COMPOSE := $(shell command -v docker 2>/dev/null && docker compose version >/dev/null 2>&1 && echo "docker compose" || command -v podman-compose 2>/dev/null && echo "podman-compose" || echo "docker-compose")
BACKEND_URL := http://localhost:8000

.DEFAULT_GOAL := help

.PHONY: help up down build restart logs logs-backend logs-frontend \
        shell ps clean test scan status

help: ## Mostra este help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*##"}{printf "\033[36m%-18s\033[0m %s\n",$$1,$$2}'

# ---------------------------------------------------------------------------
# Stack
# ---------------------------------------------------------------------------

up: ## Build + sobe a stack em background
	@mkdir -p backend/data
	$(COMPOSE) up --build -d

down: ## Para e remove os containers
	$(COMPOSE) down

build: ## Rebuilda as imagens sem subir
	$(COMPOSE) build

restart: down up ## Para e sobe novamente

ps: ## Status dos containers
	$(COMPOSE) ps

# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

logs: ## Logs de todos os serviços (follow)
	$(COMPOSE) logs -f

logs-backend: ## Logs só do backend
	$(COMPOSE) logs -f backend

logs-frontend: ## Logs só do frontend
	$(COMPOSE) logs -f frontend

# ---------------------------------------------------------------------------
# Dev
# ---------------------------------------------------------------------------

shell: ## Abre shell no container do backend
	$(COMPOSE) exec backend bash

shell-frontend: ## Abre shell no container do frontend
	$(COMPOSE) exec frontend sh

# ---------------------------------------------------------------------------
# Testes e saúde
# ---------------------------------------------------------------------------

test: ## Testa saúde da stack via HTTP
	@echo "Testando backend..."
	@curl -sf $(BACKEND_URL)/api/health | python3 -m json.tool
	@echo ""
	@echo "Testando endpoints principais..."
	@curl -sf $(BACKEND_URL)/api/groups  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  grupos: {len(d)}')"
	@curl -sf $(BACKEND_URL)/api/config  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  config: provider={d[\"wa_provider\"]} interval={d[\"global_interval\"]}min')"
	@curl -sf $(BACKEND_URL)/api/scan/status | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  scheduler: running={d[\"running\"]} next={d.get(\"next_run\",\"?\")[:19]}')"
	@echo ""
	@echo "Stack OK — frontend: http://localhost:3000  docs: $(BACKEND_URL)/docs"

status: ## Status resumido da stack + próximo scan
	@$(COMPOSE) ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || $(COMPOSE) ps
	@echo ""
	@curl -sf $(BACKEND_URL)/api/scan/status 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Scheduler: running={d[\"running\"]}  next_run={str(d.get(\"next_run\",\"?\"))[:19]}  interval={d.get(\"interval_minutes\",\"?\")}min')" 2>/dev/null || echo "Backend offline"

scan: ## Dispara scan manual em todos os grupos ativos
	@echo "Disparando scans..."
	@curl -sf $(BACKEND_URL)/api/groups | python3 -c "\
import sys, json, urllib.request; \
groups = json.load(sys.stdin); \
active = [g for g in groups if g['active']]; \
print(f'  {len(active)} grupos ativos'); \
[urllib.request.urlopen(urllib.request.Request(f'$(BACKEND_URL)/api/groups/{g[\"id\"]}/scan', method='POST')) for g in active]; \
print('  scans disparados')"

# ---------------------------------------------------------------------------
# Limpeza
# ---------------------------------------------------------------------------

clean: ## Remove containers, imagens e volume de dados (DESTRUTIVO)
	@echo "AVISO: isso remove containers, imagens e o volume promo-hunter-data"
	@read -p "Confirma? [y/N] " ans && [ "$$ans" = "y" ] || exit 1
	$(COMPOSE) down --volumes --remove-orphans
	$(COMPOSE) down --rmi local 2>/dev/null || true
	@echo "Limpo."

clean-containers: ## Remove só os containers (mantém imagens e dados)
	$(COMPOSE) down --remove-orphans
