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
async def create_group(data: GroupCreate, session: Session = Depends(get_session)):
    group = Group(**data.model_dump())

    # Auto-cria grupo no WhatsApp se WA está configurado e nenhum ID foi fornecido
    if not group.whatsapp_group_id:
        config = session.get(AppConfig, 1)
        if config and config.wa_api_key:
            adapter = get_adapter(
                config.wa_provider,
                config.wa_base_url or "",
                config.wa_api_key or "",
                config.wa_instance or "",
            )
            if adapter:
                wa_id = await adapter.create_group(group.name, [])
                if wa_id:
                    group.whatsapp_group_id = wa_id
                    group.wa_group_status = "ok"

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


@router.post("/{group_id}/create-wa-group", status_code=202)
async def create_wa_group(
    group_id: int,
    body: CreateWAGroupRequest,
    background_tasks: BackgroundTasks,
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

    # Roda em background — Baileys pode levar até 60s em sessões novas
    async def _do_create():
        from ..database import engine
        from sqlmodel import Session as SSession
        wa_id = await adapter.create_group(group.name, body.participants)
        if wa_id:
            with SSession(engine) as s:
                g = s.get(Group, group_id)
                if g:
                    g.whatsapp_group_id = wa_id
                    g.wa_group_status = "ok"
                    g.updated_at = datetime.utcnow()
                    s.add(g)
                    s.commit()
            logger.info(f"Grupo WA criado: {wa_id} para grupo {group_id}")
        else:
            logger.error(f"Falha ao criar grupo WA para grupo {group_id}")

    background_tasks.add_task(asyncio.ensure_future, _do_create())
    return {"message": "Criação em andamento — recarregue em ~30s"}
