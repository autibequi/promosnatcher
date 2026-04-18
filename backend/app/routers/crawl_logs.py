from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from ..database import get_session
from ..models import CrawlLog, SearchTerm

router = APIRouter(prefix="/crawl-logs", tags=["crawl-logs"])


@router.get("")
def list_crawl_logs(
    term_id: int | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    session: Session = Depends(get_session),
):
    q = select(CrawlLog)
    if term_id is not None:
        q = q.where(CrawlLog.search_term_id == term_id)
    if status:
        q = q.where(CrawlLog.status == status)
    q = q.order_by(CrawlLog.started_at.desc()).offset(offset).limit(limit)
    logs = session.exec(q).all()

    term_ids = {log.search_term_id for log in logs}
    terms = {t.id: t.query for t in session.exec(
        select(SearchTerm).where(SearchTerm.id.in_(term_ids))
    ).all()} if term_ids else {}

    return [
        {
            "id": log.id,
            "search_term_id": log.search_term_id,
            "search_term_query": terms.get(log.search_term_id, "—"),
            "started_at": log.started_at,
            "finished_at": log.finished_at,
            "status": log.status,
            "ml_count": log.ml_count,
            "amz_count": log.amz_count,
            "total_count": log.ml_count + log.amz_count,
            "error_msg": log.error_msg,
        }
        for log in logs
    ]
