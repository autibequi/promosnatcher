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
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # coluna já existe


def get_session():
    with Session(engine) as session:
        yield session
