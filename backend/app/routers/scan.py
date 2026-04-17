from fastapi import APIRouter, BackgroundTasks, Depends
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


@router.post("/pipeline")
async def trigger_pipeline(bg: BackgroundTasks):
    """Dispara o pipeline v2 completo: crawl → process → evaluate."""
    from ..services.pipeline import run_pipeline
    bg.add_task(run_pipeline)
    return {"message": "Pipeline v2 disparado"}
