import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from .database import create_db_and_tables, migrate_db
from .routers import groups, products, scan, config
from .services import scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    migrate_db()
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

app.include_router(groups.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(scan.router, prefix="/api")
app.include_router(config.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
