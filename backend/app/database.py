import os
from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)


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
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # coluna já existe

    # Backfill short_ids para produtos existentes sem um
    _backfill_short_ids()
    _backfill_family_keys()


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


def _backfill_family_keys():
    """
    Reconstrói family_keys para todos os produtos usando fuzzy matching cross-produto.
    Agrupa variantes (mesmo produto, sabores diferentes) dentro de cada grupo.
    Roda sempre no boot — idempotente e rápido para DBs sem mudanças.
    """
    from .services.scanner import _normalize_title, _compute_family_key
    from .models import Product, Group

    with Session(engine) as session:
        groups = session.exec(text("SELECT id FROM \"group\"")).all()
        updated = 0

        for (group_id,) in groups:
            products = session.exec(
                text("SELECT id, title, family_key FROM product WHERE group_id = :gid ORDER BY found_at ASC"),
                {"gid": group_id},
            ).all()

            if not products:
                continue

            # Reconstrói family_keys com fuzzy matching entre produtos do mesmo grupo
            assigned: dict[str, str] = {}  # normalized -> family_key
            new_keys: dict[int, str] = {}   # product_id -> new family_key

            for pid, title, _ in products:
                fk = _compute_family_key(title, assigned)
                assigned[_normalize_title(title)] = fk
                new_keys[pid] = fk

            # Persiste apenas os que mudaram
            for pid, title, old_fk in products:
                new_fk = new_keys[pid]
                if old_fk != new_fk:
                    session.execute(
                        text("UPDATE product SET family_key = :fk WHERE id = :pid"),
                        {"fk": new_fk, "pid": pid},
                    )
                    updated += 1

        if updated:
            session.commit()
            import logging
            logging.getLogger(__name__).info(f"backfill: {updated} family_keys atualizados")


def get_session():
    with Session(engine) as session:
        yield session
