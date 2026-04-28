"""CRUD SearchTerms + crawl manual."""
import json
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from ..database import get_session
from ..models import SearchTerm, CrawlResult
from ..schemas import (
    SearchTermCreate, SearchTermUpdate, SearchTermRead,
    CrawlResultRead, CrawlResultsPage,
)

router = APIRouter(prefix="/search-terms", tags=["search-terms"])


def _dump(data: SearchTermCreate | SearchTermUpdate) -> dict:
    d = data.model_dump(exclude_none=True)
    if "queries" in d:
        d["queries"] = json.dumps(d["queries"], ensure_ascii=False)
    return d


@router.get("", response_model=list[SearchTermRead])
def list_terms(session: Session = Depends(get_session)):
    return session.exec(select(SearchTerm).order_by(SearchTerm.created_at.desc())).all()


@router.post("", response_model=SearchTermRead, status_code=201)
def create_term(data: SearchTermCreate, session: Session = Depends(get_session)):
    term = SearchTerm(**_dump(data))
    session.add(term)
    session.commit()
    session.refresh(term)
    return term


@router.get("/{term_id}", response_model=SearchTermRead)
def get_term(term_id: int, session: Session = Depends(get_session)):
    term = session.get(SearchTerm, term_id)
    if not term:
        raise HTTPException(404, "SearchTerm not found")
    return term


@router.put("/{term_id}", response_model=SearchTermRead)
def update_term(term_id: int, data: SearchTermUpdate, session: Session = Depends(get_session)):
    term = session.get(SearchTerm, term_id)
    if not term:
        raise HTTPException(404, "SearchTerm not found")
    for field, value in _dump(data).items():
        setattr(term, field, value)
    session.add(term)
    session.commit()
    session.refresh(term)
    return term


@router.delete("/{term_id}", status_code=204)
def delete_term(term_id: int, session: Session = Depends(get_session)):
    term = session.get(SearchTerm, term_id)
    if not term:
        raise HTTPException(404, "SearchTerm not found")
    session.delete(term)
    session.commit()


@router.post("/{term_id}/crawl")
async def crawl_now(term_id: int, bg: BackgroundTasks, session: Session = Depends(get_session)):
    """Dispara crawl manual imediato."""
    term = session.get(SearchTerm, term_id)
    if not term:
        raise HTTPException(404, "SearchTerm not found")

    from ..services.pipeline import crawl_search_term
    bg.add_task(crawl_search_term, term_id)
    return {"message": f"Crawl iniciado para '{term.query}'"}


@router.get("/{term_id}/results", response_model=CrawlResultsPage)
def list_results(
    term_id: int,
    limit: int = Query(30, le=100),
    offset: int = Query(0),
    session: Session = Depends(get_session),
):
    """Lista CrawlResults de um SearchTerm (raw view)."""
    term = session.get(SearchTerm, term_id)
    if not term:
        raise HTTPException(404, "SearchTerm not found")

    total = session.scalar(
        select(func.count(CrawlResult.id)).where(CrawlResult.search_term_id == term_id)
    ) or 0
    items = session.exec(
        select(CrawlResult)
        .where(CrawlResult.search_term_id == term_id)
        .order_by(CrawlResult.crawled_at.desc())
        .offset(offset).limit(limit)
    ).all()
    return CrawlResultsPage(items=items, total=total, limit=limit, offset=offset)
