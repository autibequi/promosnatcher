import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from .database import create_db_and_tables, migrate_db
from .routers import scan, config, auth as auth_router, redirect, analytics, public, telegram
from .routers import search_terms, catalog, channels
from .services.auth import require_auth
from .services import scheduler
from .models import AppConfig

from .services.logging_config import setup_logging
setup_logging()
logger = logging.getLogger(__name__)


def _configure_defaults():
    """Auto-configura AppConfig com Evolution API se variáveis de ambiente presentes."""
    evo_url = os.getenv("EVOLUTION_URL")
    if not evo_url:
        return
    evo_instance = os.getenv("EVOLUTION_INSTANCE", "default")
    evo_key = os.getenv("EVOLUTION_API_KEY", "")
    from sqlmodel import Session
    from .database import engine
    with Session(engine) as session:
        cfg = session.get(AppConfig, 1)
        if not cfg:
            cfg = AppConfig()
            session.add(cfg)
            session.flush()
        # Sempre atualiza para refletir env vars (permite migrar WAHA → Evolution)
        if cfg.wa_base_url != evo_url or cfg.wa_api_key != evo_key or cfg.wa_instance != evo_instance:
            cfg.wa_provider = "evolution"
            cfg.wa_base_url = evo_url
            cfg.wa_api_key = evo_key
            cfg.wa_instance = evo_instance
            session.add(cfg)
            session.commit()
            logger.info(f"Evolution configurado: {evo_url} / instância: {evo_instance}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    migrate_db()
    _configure_defaults()
    # v2 migration: Group/Product → pipeline models
    from .services.migrate_v2 import migrate_v1_to_v2
    try:
        migrate_v1_to_v2()
    except Exception as e:
        logger.error(f"v2 migration failed (non-fatal): {e}")
    interval = int(os.getenv("SCAN_INTERVAL", "30"))
    scheduler.start(interval)
    logger.info("App started")
    yield
    scheduler.stop()
    logger.info("App stopped")


app = FastAPI(
    title="Promo Snatcher",
    description="Varredor automático de preços com envio para grupos WhatsApp",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api")
app.include_router(scan.router, prefix="/api", dependencies=[Depends(require_auth)])
# Rotas públicas do config (sem auth) — registradas ANTES do router protegido
from fastapi.responses import HTMLResponse
from .routers.config import wa_qr
app.add_api_route("/api/config/wa/qr", wa_qr, methods=["GET"],
                  response_class=HTMLResponse, tags=["config"])

app.include_router(config.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(telegram.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(analytics.router, prefix="/api", dependencies=[Depends(require_auth)])

# v2 Pipeline routers
app.include_router(search_terms.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(catalog.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(channels.router, prefix="/api", dependencies=[Depends(require_auth)])

# Rotas públicas (sem auth)
app.include_router(redirect.router)  # /r/{short_id}
app.include_router(public.router, prefix="/api")  # /api/public/groups


@app.get("/api/health")
def health():
    return {"status": "ok"}
