# Promo Snatcher — Makefile
# Detecta docker compose v2 ou podman-compose
COMPOSE := $(shell \
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then \
    echo "docker compose"; \
  elif command -v podman-compose >/dev/null 2>&1; then \
    echo "podman-compose"; \
  else \
    echo "docker-compose"; \
  fi)
BACKEND_URL := http://localhost:8000
FRONTEND_URL := http://localhost:6060

.DEFAULT_GOAL := help

.PHONY: help setup start start-tunnel up down dev dev-down dev-logs logs logs-backend logs-frontend \
        shell ps clean test scan status fix-network

help: ## Mostra este help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*##"}{printf "\033[36m%-18s\033[0m %s\n",$$1,$$2}'

# ---------------------------------------------------------------------------
# Stack
# ---------------------------------------------------------------------------

setup: ## Primeira execução: cria .env e gera segredos automáticos
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✓ .env criado a partir do .env.example"; \
	else \
		echo ".env já existe — pulando cópia"; \
	fi
	@python3 -c "\
import re, secrets, pathlib; \
p = pathlib.Path('.env'); \
env = p.read_text(); \
changed = False; \
lines = []; \
for line in env.splitlines(): \
    if line.startswith('AUTH_SECRET=') and not line.split('=',1)[1].strip(): \
        line = 'AUTH_SECRET=' + secrets.token_hex(32); changed = True; \
    lines.append(line); \
p.write_text('\n'.join(lines) + '\n') if changed else None; \
print('✓ AUTH_SECRET gerado automaticamente') if changed else None"
	@echo ""
	@echo "Próximos passos:"
	@echo "  1. Edite .env e defina: AUTH_PASSWORD, EVOLUTION_API_KEY"
	@echo "  2. Opcional (acesso externo): CLOUDFLARE_TOKEN"
	@echo "  3. make start"

start: ## Produção: rebuild + sobe (sem derrubar stack existente)
	@[ -f .env ] || { echo "Rodando setup primeiro..."; $(MAKE) setup; }
	@mkdir -p backend/data
	$(COMPOSE) up --build --remove-orphans -d
	@echo ""
	@echo "Stack no ar: http://$$(hostname -I | awk '{print $$1}'):$${FRONTEND_PORT:-6060}"
	@echo "Logs: make logs  |  Status: make status"

start-tunnel: ## Produção + Cloudflare Tunnel (requer CLOUDFLARE_TOKEN no .env)
	@[ -f .env ] || { echo "Rodando setup primeiro..."; $(MAKE) setup; }
	@mkdir -p backend/data
	COMPOSE_PROFILES=tunnel $(COMPOSE) up --build --remove-orphans -d
	@echo ""
	@echo "Stack + Tunnel no ar. Logs: make logs"

up: ## Sobe a stack em background (sem rebuild)
	@mkdir -p backend/data
	$(COMPOSE) up --remove-orphans -d

down: ## Para e remove os containers
	$(COMPOSE) down

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

dev: ## Modo dev com hot-reload (backend uvicorn --reload + frontend vite dev)
	@mkdir -p backend/data
	$(COMPOSE) -f docker-compose.dev.yml up --build --remove-orphans -d
	@echo ""
	@echo "🔥 Dev mode — hot-reload ativo"
	@echo "   Frontend: http://localhost:6060 (Vite HMR)"
	@echo "   Backend:  http://localhost:8000 (uvicorn --reload)"
	@echo "   Evolution: http://localhost:3200"
	@echo "   Logs:     make dev-logs"

dev-down: ## Para o ambiente dev
	$(COMPOSE) -f docker-compose.dev.yml down

dev-logs: ## Logs do ambiente dev (follow)
	$(COMPOSE) -f docker-compose.dev.yml logs -f

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
	@echo "Stack OK — frontend: $(FRONTEND_URL)  docs: $(BACKEND_URL)/docs"

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
	@echo "AVISO: isso remove containers, imagens e o volume promo-snatcher-data"
	@read -p "Confirma? [y/N] " ans && [ "$$ans" = "y" ] || exit 1
	$(COMPOSE) down --volumes --remove-orphans
	$(COMPOSE) down --rmi local 2>/dev/null || true
	@echo "Limpo."

clean-containers: ## Remove só os containers (mantém imagens e dados)
	$(COMPOSE) down --remove-orphans

fix-network: ## Reaplica aliases DNS da rede Podman (rodar se 502 aparecer)
	@python3 -c "\
import docker, time; \
c = docker.DockerClient(base_url='unix:///run/user/host/podman/podman.sock'); \
net = c.networks.get('promo-snatcher'); \
aliases = {'promo-snatcher-backend':'backend','promo-snatcher-evolution':'evolution','promo-snatcher-postgres':'postgres','promo-snatcher-redis':'redis'}; \
[([net.disconnect(c.containers.get(n), force=True) if True else None, net.connect(c.containers.get(n), aliases=[a])] if c.containers.get(n) else None) for n,a in aliases.items() if c.containers.get(n) is not None]; \
fe = c.containers.get('promo-snatcher-frontend'); \
[net.disconnect(fe, force=True), net.connect(fe), fe.exec_run('nginx -s reload')]; \
print('Aliases reconfigurados')"; \
	@echo "Testando..."
	@curl -sf $(BACKEND_URL)/api/health > /dev/null && echo "Backend: OK" || echo "Backend: OFFLINE"
	@curl -sf http://localhost:6060/api/health > /dev/null && echo "Nginx proxy: OK" || echo "Nginx proxy: FAIL"
