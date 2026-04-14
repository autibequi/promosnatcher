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
    """Pré-configura AppConfig com Evolution API se ainda não configurado."""
    evolution_url = os.getenv("EVOLUTION_URL")
    evolution_key = os.getenv("EVOLUTION_API_KEY")
    evolution_instance = os.getenv("EVOLUTION_INSTANCE", "promo-hunter")
    if not (evolution_url and evolution_key):
        return
    from sqlmodel import Session
    from .database import engine
    with Session(engine) as session:
        cfg = session.get(AppConfig, 1)
        if not cfg:
            cfg = AppConfig()
            session.add(cfg)
            session.flush()
        if not cfg.wa_api_key:
            cfg.wa_provider = "evolution"
            cfg.wa_base_url = evolution_url
            cfg.wa_api_key = evolution_key
            cfg.wa_instance = evolution_instance
            session.add(cfg)
            session.commit()
            logger.info(f"Evolution API auto-configurada: {evolution_url} / instância: {evolution_instance}")


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
    title="Promo Hunter",
    description="Varredor de preços + gerenciamento de grupos WhatsApp",
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
app.include_router(config.router, prefix="/api", dependencies=[Depends(require_auth)])


@app.get("/api/health")
def health():
    return {"status": "ok"}
