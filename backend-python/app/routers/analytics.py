"""Analytics — cliques via ClickLog (v1 Product) + métricas do catálogo v2."""
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, text
from sqlmodel import Session, select

from ..database import get_session
from ..models import ClickLog, CatalogProduct, CatalogVariant, SentMessageV2

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
def analytics_summary(
    days: int = Query(30, le=365),
    session: Session = Depends(get_session),
):
    since = datetime.utcnow() - timedelta(days=days)

    # Cliques (via ClickLog — funciona com v1 Product que ainda existe no DB)
    total = session.scalar(
        select(func.count(ClickLog.id)).where(ClickLog.clicked_at >= since)
    ) or 0

    unique = session.scalar(
        select(func.count(func.distinct(ClickLog.ip_hash))).where(ClickLog.clicked_at >= since)
    ) or 0

    # Cliques por dia
    daily_rows = session.execute(text("""
        SELECT strftime('%Y-%m-%d', clicked_at) AS day, COUNT(*) AS clicks
        FROM clicklog
        WHERE clicked_at >= :since
        GROUP BY day ORDER BY day
    """), {"since": since.isoformat()}).all()
    daily = [{"date": r[0], "clicks": r[1]} for r in daily_rows]

    # Por source (via JOIN com Product v1)
    source_rows = session.execute(text("""
        SELECT p.source, COUNT(*) AS clicks
        FROM clicklog c JOIN product p ON c.product_id = p.id
        WHERE c.clicked_at >= :since
        GROUP BY p.source
    """), {"since": since.isoformat()}).all()
    by_source = [{"source": r[0], "clicks": r[1]} for r in source_rows]

    # Top 10 produtos (v1 Product)
    top_rows = session.execute(text("""
        SELECT p.id, p.title, p.source, p.price, COUNT(*) AS clicks
        FROM clicklog c JOIN product p ON c.product_id = p.id
        WHERE c.clicked_at >= :since
        GROUP BY p.id ORDER BY clicks DESC LIMIT 10
    """), {"since": since.isoformat()}).all()
    top_products = [
        {"id": r[0], "title": r[1], "source": r[2], "price": r[3], "clicks": r[4]}
        for r in top_rows
    ]

    # Métricas v2 do catálogo
    catalog_total = session.scalar(select(func.count(CatalogProduct.id))) or 0
    catalog_new = session.scalar(
        select(func.count(CatalogProduct.id)).where(CatalogProduct.created_at >= since)
    ) or 0
    variants_total = session.scalar(select(func.count(CatalogVariant.id))) or 0
    messages_sent = session.scalar(
        select(func.count(SentMessageV2.id)).where(SentMessageV2.sent_at >= since)
    ) or 0

    return {
        "total": total,
        "unique": unique,
        "daily": daily,
        "by_source": by_source,
        "top_products": top_products,
        "days": days,
        # v2 metrics
        "catalog_total": catalog_total,
        "catalog_new": catalog_new,
        "variants_total": variants_total,
        "messages_sent": messages_sent,
    }


@router.get("/by-group")
def analytics_by_group(
    days: int = Query(30, le=365),
    session: Session = Depends(get_session),
):
    """Cliques por grupo (v1) — mantido pra backward compat com dashboard."""
    since = datetime.utcnow() - timedelta(days=days)

    rows = session.execute(text("""
        SELECT g.id, g.name, COUNT(*) AS clicks
        FROM clicklog c
        JOIN product p ON c.product_id = p.id
        JOIN "group" g ON p.group_id = g.id
        WHERE c.clicked_at >= :since
        GROUP BY g.id ORDER BY clicks DESC
    """), {"since": since.isoformat()}).all()

    return [{"id": r[0], "name": r[1], "clicks": r[2]} for r in rows]
