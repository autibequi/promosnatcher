import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select

from ..database import get_session
from ..models import Group, ScanJob, AppConfig
from ..schemas import GroupCreate, GroupRead, GroupUpdate, CreateWAGroupRequest
from ..services.whatsapp.factory import get_adapter

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("", response_model=list[GroupRead])
def list_groups(session: Session = Depends(get_session)):
    return session.exec(select(Group)).all()


@router.post("", response_model=GroupRead, status_code=201)
def create_group(data: GroupCreate, session: Session = Depends(get_session)):
    group = Group(**data.model_dump())
    session.add(group)
    session.commit()
    session.refresh(group)
    return group


@router.get("/{group_id}", response_model=GroupRead)
def get_group(group_id: int, session: Session = Depends(get_session)):
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    return group


@router.put("/{group_id}", response_model=GroupRead)
def update_group(
    group_id: int, data: GroupUpdate, session: Session = Depends(get_session)
):
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(group, field, value)
    group.updated_at = datetime.utcnow()
    session.add(group)
    session.commit()
    session.refresh(group)
    return group


@router.delete("/{group_id}", status_code=204)
def delete_group(group_id: int, session: Session = Depends(get_session)):
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")
    session.delete(group)
    session.commit()


@router.post("/{group_id}/scan")
def trigger_scan(
    group_id: int,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")

    from ..services.scanner import scan_group

    def run_scan():
        asyncio.run(scan_group(group_id))

    background_tasks.add_task(run_scan)
    return {"message": "Scan iniciado", "group_id": group_id}


@router.post("/{group_id}/create-wa-group")
async def create_wa_group(
    group_id: int,
    body: CreateWAGroupRequest,
    session: Session = Depends(get_session),
):
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")

    config = session.get(AppConfig, 1)
    if not config:
        raise HTTPException(400, "WhatsApp não configurado")

    adapter = get_adapter(
        config.wa_provider,
        config.wa_base_url or "",
        config.wa_api_key or "",
        config.wa_instance or "",
    )
    if not adapter:
        raise HTTPException(400, "Configuração WhatsApp incompleta")

    wa_id = await adapter.create_group(group.name, body.participants)
    if not wa_id:
        raise HTTPException(502, "Falha ao criar grupo no WhatsApp")

    group.whatsapp_group_id = wa_id
    group.updated_at = datetime.utcnow()
    session.add(group)
    session.commit()
    return {"whatsapp_group_id": wa_id}
