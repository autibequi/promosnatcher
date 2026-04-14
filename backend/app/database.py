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
        try:
            conn.execute(text('ALTER TABLE "group" ADD COLUMN message_template TEXT'))
            conn.commit()
        except Exception:
            pass  # coluna já existe


def get_session():
    with Session(engine) as session:
        yield session
