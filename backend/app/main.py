import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from .database import create_db_and_tables, migrate_db
from .routers import groups, products, scan, config, auth as auth_router
from .services.auth import require_auth
from .services import scheduler
from .models import AppConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _configure_defaults():
    """Auto-configura AppConfig com WAHA se variáveis de ambiente presentes."""
    waha_url = os.getenv("WAHA_URL")
    if not waha_url:
        return
    waha_session = os.getenv("WAHA_SESSION", "default")
    waha_key = os.getenv("WAHA_API_KEY", "")
    from sqlmodel import Session
    from .database import engine
    with Session(engine) as session:
        cfg = session.get(AppConfig, 1)
        if not cfg:
            cfg = AppConfig()
            session.add(cfg)
            session.flush()
        # Só configura se ainda não foi configurado manualmente
        if not cfg.wa_base_url:
            cfg.wa_provider = "waha"
            cfg.wa_base_url = waha_url
            cfg.wa_api_key = waha_key
            cfg.wa_instance = waha_session
            session.add(cfg)
            session.commit()
            logger.info(f"WAHA auto-configurado: {waha_url} / sessão: {waha_session}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    migrate_db()
    _configure_defaults()
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
app.include_router(groups.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(products.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(scan.router, prefix="/api", dependencies=[Depends(require_auth)])
# Rotas públicas do config (sem auth) — registradas ANTES do router protegido
from fastapi.responses import HTMLResponse
from .routers.config import wa_qr
app.add_api_route("/api/config/wa/qr", wa_qr, methods=["GET"],
                  response_class=HTMLResponse, tags=["config"])

app.include_router(config.router, prefix="/api", dependencies=[Depends(require_auth)])


@app.get("/api/health")
def health():
    return {"status": "ok"}
