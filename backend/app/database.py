import os
from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

# WAL mode: leituras não bloqueiam escritas — crítico com scheduler + requests simultâneos
with engine.connect() as _conn:
    _conn.execute(text("PRAGMA journal_mode=WAL"))
    _conn.execute(text("PRAGMA synchronous=NORMAL"))
    _conn.execute(text("PRAGMA cache_size=-8000"))   # 8MB cache em RAM
    _conn.execute(text("PRAGMA temp_store=MEMORY"))


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def migrate_db():
    """Migrations incrementais para DBs já existentes."""
    with engine.connect() as conn:
        for stmt in [
            'ALTER TABLE "group" ADD COLUMN message_template TEXT',
            'ALTER TABLE appconfig ADD COLUMN send_start_hour INTEGER NOT NULL DEFAULT 8',
            'ALTER TABLE appconfig ADD COLUMN send_end_hour INTEGER NOT NULL DEFAULT 22',
            'ALTER TABLE appconfig ADD COLUMN ml_client_id TEXT',
            'ALTER TABLE appconfig ADD COLUMN ml_client_secret TEXT',
            "ALTER TABLE appconfig ADD COLUMN wa_group_prefix TEXT DEFAULT 'Snatcher'",
            'ALTER TABLE "group" ADD COLUMN wa_group_status TEXT',
            'ALTER TABLE appconfig ADD COLUMN amz_tracking_id TEXT',
            'ALTER TABLE appconfig ADD COLUMN ml_affiliate_tool_id TEXT',
            'ALTER TABLE appconfig ADD COLUMN alert_phone TEXT',
            'ALTER TABLE product ADD COLUMN short_id TEXT',
            'ALTER TABLE appconfig ADD COLUMN use_short_links BOOLEAN DEFAULT 1',
            # Telegram
            'ALTER TABLE "group" ADD COLUMN telegram_chat_id TEXT',
            'ALTER TABLE "group" ADD COLUMN tg_group_status TEXT',
            'ALTER TABLE appconfig ADD COLUMN tg_enabled BOOLEAN DEFAULT 0',
            'ALTER TABLE appconfig ADD COLUMN tg_bot_token TEXT',
            'ALTER TABLE appconfig ADD COLUMN tg_bot_username TEXT',
            "ALTER TABLE appconfig ADD COLUMN tg_group_prefix TEXT DEFAULT 'Snatcher'",
            'ALTER TABLE appconfig ADD COLUMN tg_last_update_id INTEGER',
            # Family grouping
            'ALTER TABLE product ADD COLUMN family_key TEXT',
            # TelegramChat → Channel linking
            'ALTER TABLE telegramchat ADD COLUMN linked_channel_id INTEGER',
            # Channel digest mode
            'ALTER TABLE channel ADD COLUMN digest_mode BOOLEAN DEFAULT 0',
            'ALTER TABLE channel ADD COLUMN digest_max_items INTEGER DEFAULT 5',
            # SearchTerm multi-query
            "ALTER TABLE searchterm ADD COLUMN queries TEXT DEFAULT '[]'",
            # Group redirect via subdomain
            'ALTER TABLE channel ADD COLUMN slug TEXT UNIQUE',
            'ALTER TABLE channeltarget ADD COLUMN invite_url TEXT',
            'ALTER TABLE channeltarget ADD COLUMN name TEXT',
            # CrawlLog table is created by SQLModel.metadata.create_all — no ALTER needed
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # coluna já existe

    # Backfill short_ids para produtos v1 existentes
    _backfill_short_ids()


def _backfill_short_ids():
    """Preenche short_id para produtos existentes que não têm."""
    from .models import _gen_short_id
    with Session(engine) as session:
        rows = session.exec(text("SELECT id FROM product WHERE short_id IS NULL OR short_id = ''")).all()
        for (pid,) in rows:
            session.execute(
                text("UPDATE product SET short_id = :sid WHERE id = :pid"),
                {"sid": _gen_short_id(), "pid": pid},
            )
        if rows:
            session.commit()


def get_session():
    with Session(engine) as session:
        yield session
