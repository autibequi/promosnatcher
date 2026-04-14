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
    """Página HTML com QR code. Funciona para WAHA e Evolution API."""
    config = _get_or_create_config(session)

    if config.wa_provider == "waha":
        adapter = get_adapter("waha", config.wa_base_url or "",
                              config.wa_api_key or "", config.wa_instance or "")
        if not adapter:
            raise HTTPException(400, "WAHA não configurado")

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
            img{{border:8px solid white;border-radius:8px;max-width:320px}}</style>
            </head><body>
            <h2>📱 Escanear QR — {wa_status}</h2>
            <p>WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
            <img src="{qr}" alt="QR Code" />
            <p>Recarrega automaticamente em 15s</p>
            <script>setTimeout(()=>location.reload(),15000)</script>
            </body></html>""")

        return HTMLResponse(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>WhatsApp</title>
        <style>body{{font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#eee}}</style>
        </head><body>
        <h2>Status: {wa_status}</h2>
        <p>Aguardando QR code... recarregando em 5s</p>
        <script>setTimeout(()=>location.reload(),5000)</script>
        </body></html>""")

    # Evolution fallback
    if not config.wa_base_url or not config.wa_api_key or not config.wa_instance:
        raise HTTPException(400, "WhatsApp não configurado")

    url = f"{config.wa_base_url}/instance/connect/{config.wa_instance}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, headers={"apikey": config.wa_api_key})
        data = r.json()
    except Exception as e:
        raise HTTPException(502, f"Erro ao conectar: {e}")

    qr_b64 = data.get("base64", "")
    status = data.get("instance", {}).get("state", "connecting")
    if not qr_b64:
        return HTMLResponse(f"<p>Status: {status}</p><script>setTimeout(()=>location.reload(),5000)</script>")

    return HTMLResponse(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>WhatsApp QR</title>
    <style>body{{font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#eee}}
    img{{border:8px solid white;border-radius:8px;max-width:320px}}</style>
    </head><body>
    <h2>📱 Conectar WhatsApp</h2>
    <img src="{qr_b64}" alt="QR Code" />
    <script>setTimeout(()=>location.reload(),20000)</script>
    </body></html>""")


# ---------------------------------------------------------------------------
# WhatsApp — status, sessão, grupos
# ---------------------------------------------------------------------------

@router.get("/wa/status")
async def wa_status(session: Session = Depends(get_session)):
    """Status da sessão WA: STOPPED | STARTING | SCAN_QR_CODE | WORKING"""
    config = _get_or_create_config(session)
    if config.wa_provider == "waha":
        adapter = get_adapter("waha", config.wa_base_url or "",
                              config.wa_api_key or "", config.wa_instance or "")
        if not adapter:
            return {"status": "NOT_CONFIGURED"}
        return await adapter.get_session_status()
    # Para outros providers, usa test_connection
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        return {"status": "NOT_CONFIGURED"}
    connected = await adapter.test_connection()
    return {"status": "WORKING" if connected else "DISCONNECTED",
            "provider": config.wa_provider}


@router.post("/wa/session/logout")
async def wa_logout_session(session: Session = Depends(get_session)):
    """Desconecta o WhatsApp (faz logout da sessão WAHA)."""
    config = _get_or_create_config(session)
    if config.wa_provider != "waha":
        raise HTTPException(400, "Apenas para WAHA")
    adapter = get_adapter("waha", config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "WAHA não configurado")
    ok = await adapter.logout_session()
    return {"logged_out": ok}


@router.post("/wa/session/start")
async def wa_start_session(session: Session = Depends(get_session)):
    """Inicia/cria sessão WAHA."""
    config = _get_or_create_config(session)
    if config.wa_provider != "waha":
        raise HTTPException(400, "Apenas para WAHA")
    adapter = get_adapter("waha", config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "WAHA não configurado (wa_base_url ausente)")
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
        raise HTTPException(400, f"Provider '{config.wa_provider}' não suporta listagem de grupos")
    groups = await adapter.list_groups()
    prefix = config.wa_group_prefix or ""
    if prefix:
        groups = [g for g in groups if g["name"].startswith(prefix)]
    return groups


class WAGroupCreate(BaseModel):
    name: str


@router.post("/wa/groups", status_code=202)
async def create_wa_group_via_config(
    body: WAGroupCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Cria grupo WA em background. Atualiza lista em ~10s."""
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "WhatsApp não configurado")

    prefix = config.wa_group_prefix or ""
    full_name = f"{prefix} - {body.name}" if prefix else body.name

    async def _create():
        wa_id = await adapter.create_group(full_name, [])
        if wa_id:
            logger.info(f"Grupo WA criado: {wa_id} ({full_name})")
        else:
            logger.error(f"Falha ao criar grupo WA: {full_name}")

    background_tasks.add_task(_create)
    return {"message": f"Criando '{body.name}'... atualize a lista em ~10s"}


@router.post("/test-wa")
async def test_wa(session: Session = Depends(get_session)):
    config = _get_or_create_config(session)
    adapter = get_adapter(config.wa_provider, config.wa_base_url or "",
                          config.wa_api_key or "", config.wa_instance or "")
    if not adapter:
        raise HTTPException(400, "Configuração incompleta")
    ok = await adapter.test_connection()
    return {"connected": ok}
