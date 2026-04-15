import asyncio
import logging
import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlmodel import Session

from ..database import get_session
from ..models import AppConfig
from ..schemas import AppConfigRead, AppConfigUpdate
from ..services.whatsapp.factory import get_adapter
from ..services import scheduler

logger = logging.getLogger(__name__)
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
def update_config(data: AppConfigUpdate, session: Session = Depends(get_session)):
    config = _get_or_create_config(session)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(config, field, value)
    session.add(config)
    session.commit()
    session.refresh(config)
    if data.global_interval:
        scheduler.restart(data.global_interval)
    return config


# ---------------------------------------------------------------------------
# WhatsApp — QR code
# ---------------------------------------------------------------------------

@router.get("/wa/qr", response_class=HTMLResponse)
async def wa_qr(session: Session = Depends(get_session)):
    """Página HTML com QR code para conectar WhatsApp."""
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "WhatsApp não configurado")

    status_data = await adapter.get_session_status()
    wa_status = status_data.get("status", "UNKNOWN")

    if wa_status == "WORKING":
        return HTMLResponse("""<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>WhatsApp Conectado</title>
        <style>body{font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#eee}</style>
        </head><body><h2>✅ WhatsApp Conectado!</h2>
        <p>Sessão ativa. Pode fechar esta página.</p>
        <script>setTimeout(()=>location.reload(),30000)</script>
        </body></html>""")

    qr = await adapter.get_qr_code()
    if qr:
        return HTMLResponse(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>WhatsApp QR</title>
        <style>body{{font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#eee}}
        img{{border:8px solid white;border-radius:8px;width:380px;max-width:90vw}}</style>
        </head><body>
        <h2>📱 Escanear QR</h2>
        <p>WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
        <img src="{qr}" alt="QR Code" />
        <p style="color:#888;font-size:12px">Recarrega em 8s</p>
        <script>setTimeout(()=>location.reload(),8000)</script>
        </body></html>""")

    return HTMLResponse(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>WhatsApp</title>
    <style>body{{font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#eee}}</style>
    </head><body>
    <h2>Status: {wa_status}</h2>
    <p>Aguardando QR code... recarregando em 5s</p>
    <script>setTimeout(()=>location.reload(),5000)</script>
    </body></html>""")


# ---------------------------------------------------------------------------
# WhatsApp — status, sessão, grupos
# ---------------------------------------------------------------------------

@router.get("/wa/status")
async def wa_status(session: Session = Depends(get_session)):
    """Status da sessão WAHA: STOPPED | STARTING | SCAN_QR_CODE | WORKING"""
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        return {"status": "NOT_CONFIGURED"}
    return await adapter.get_session_status()


@router.post("/wa/session/logout")
async def wa_logout_session(session: Session = Depends(get_session)):
    """Desconecta o WhatsApp (logout da sessão WAHA)."""
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "WhatsApp não configurado")
    ok = await adapter.logout_session()
    return {"logged_out": ok}


@router.post("/wa/session/start")
async def wa_start_session(session: Session = Depends(get_session)):
    """Inicia/cria sessão WAHA."""
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "WhatsApp não configurado (wa_base_url ausente)")
    ok = await adapter.start_session()
    return {"started": ok}


@router.get("/wa/groups")
async def list_wa_groups(session: Session = Depends(get_session)):
    """Lista grupos WA com o prefixo configurado."""
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "WhatsApp não configurado")
    if not hasattr(adapter, "list_groups"):
        raise HTTPException(400, "Provider não suporta listagem de grupos")

    groups = await adapter.list_groups()
    prefix = config.wa_group_prefix or ""
    if prefix:
        groups = [g for g in groups if g["name"].startswith(prefix)]
    return groups


class WAGroupCreate(BaseModel):
    name: str


class WAGroupUpdate(BaseModel):
    subject: str | None = None
    description: str | None = None


@router.post("/wa/groups")
async def create_wa_group_via_config(
    body: WAGroupCreate,
    session: Session = Depends(get_session),
):
    """Cria grupo WA de forma síncrona — retorna resultado ou erro."""
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "WhatsApp não configurado")

    prefix = config.wa_group_prefix or ""
    full_name = f"{prefix} - {body.name}" if prefix else body.name

    wa_id = await adapter.create_group(full_name, [])
    if wa_id:
        # Busca invite link imediatamente
        invite = await adapter.get_invite_link(wa_id)
        logger.info(f"Grupo WA criado: {wa_id} ({full_name})")
        return {"message": f"Grupo '{full_name}' criado", "group_id": wa_id, "invite_link": invite}

    raise HTTPException(422, f"Falha ao criar grupo WA '{full_name}'. Verifique os logs do Evolution.")


@router.get("/wa/groups/{group_id}/invite")
async def get_wa_group_invite(group_id: str, session: Session = Depends(get_session)):
    """Busca invite link de um grupo WA."""
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "WhatsApp não configurado")
    link = await adapter.get_invite_link(group_id)
    if link:
        return {"invite_link": link}
    raise HTTPException(422, "Não foi possível obter o invite link")


@router.put("/wa/groups/{group_id}")
async def update_wa_group(group_id: str, body: WAGroupUpdate, session: Session = Depends(get_session)):
    """Atualiza subject e/ou description de um grupo WA."""
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "WhatsApp não configurado")
    results = {}
    if body.subject is not None:
        results["subject"] = await adapter._set_group_subject(group_id, body.subject)
    if body.description is not None:
        results["description"] = await adapter.set_group_description(group_id, body.description)
    return results


@router.delete("/wa/groups/{group_id}")
async def leave_wa_group(group_id: str, session: Session = Depends(get_session)):
    """Sai de um grupo WA."""
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "WhatsApp não configurado")
    ok = await adapter.leave_group(group_id)
    if ok:
        return {"message": "Saiu do grupo"}
    raise HTTPException(422, "Falha ao sair do grupo")


@router.post("/test-wa")
async def test_wa(session: Session = Depends(get_session)):
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "Configuração incompleta")
    ok = await adapter.test_connection()
    return {"connected": ok}
