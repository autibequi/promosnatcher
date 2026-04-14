from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..database import get_session
from ..models import AppConfig
from ..schemas import AppConfigRead, AppConfigUpdate
from ..services.whatsapp.factory import get_adapter
from ..services import scheduler

router = APIRouter(prefix="/config", tags=["config"])


def _get_or_create_config(session: Session) -> AppConfig:
    config = session.get(AppConfig, 1)
    if not config:
        config = AppConfig()
        session.add(config)
        session.commit()
        session.refresh(config)
    return config


@router.get("", response_model=AppConfigRead)
def get_config(session: Session = Depends(get_session)):
    return _get_or_create_config(session)


@router.put("", response_model=AppConfigRead)
def update_config(
    data: AppConfigUpdate, session: Session = Depends(get_session)
):
    config = _get_or_create_config(session)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(config, field, value)
    session.add(config)
    session.commit()
    session.refresh(config)

    if data.global_interval:
        scheduler.restart(data.global_interval)

    return config


@router.post("/test-wa")
async def test_wa(session: Session = Depends(get_session)):
    config = _get_or_create_config(session)
    adapter = get_adapter(
        config.wa_provider,
        config.wa_base_url or "",
        config.wa_api_key or "",
        config.wa_instance or "",
    )
    if not adapter:
        raise HTTPException(400, "Configuração incompleta")

    ok = await adapter.test_connection()
    return {"connected": ok}
