from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..database import get_session
from ..models import ScanJob
from ..schemas import ScanJobRead
from ..services import scheduler

router = APIRouter(prefix="/scan", tags=["scan"])


@router.get("/jobs", response_model=list[ScanJobRead])
def list_jobs(
    limit: int = 50,
    session: Session = Depends(get_session),
):
    return session.exec(
        select(ScanJob).order_by(ScanJob.started_at.desc()).limit(limit)
    ).all()


@router.get("/status")
def get_status():
    return scheduler.status()
