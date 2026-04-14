import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
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


@router.get("/wa/qr", response_class=HTMLResponse)
async def wa_qr(session: Session = Depends(get_session)):
    """Página HTML com QR code para conectar WhatsApp. Abre no browser sem precisar de apikey."""
    config = _get_or_create_config(session)
    if not config.wa_base_url or not config.wa_api_key or not config.wa_instance:
        raise HTTPException(400, "WhatsApp não configurado")
    if config.wa_provider != "evolution":
        raise HTTPException(400, "QR page disponível apenas para Evolution API")

    url = f"{config.wa_base_url}/instance/connect/{config.wa_instance}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, headers={"apikey": config.wa_api_key})
        if r.status_code != 200:
            raise HTTPException(502, f"Evolution API retornou {r.status_code}")
        data = r.json()
    except httpx.RequestError as e:
        raise HTTPException(502, f"Erro ao conectar Evolution API: {e}")

    qr_b64 = data.get("base64") or data.get("qrcode", {}).get("base64", "")
    status = data.get("instance", {}).get("state", "connecting")

    if not qr_b64:
        # Instância já conectada ou QR expirado
        html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>WhatsApp — Promo Hunter</title>
        <style>body{{font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#eee}}</style>
        </head><body>
        <h2>WhatsApp</h2>
        <p>Status: <strong>{status}</strong></p>
        <p>{'✅ Conectado!' if status == 'open' else 'QR expirado — aguarde alguns segundos e recarregue a página.'}</p>
        <script>if('{status}'!=='open') setTimeout(()=>location.reload(), 5000);</script>
        </body></html>"""
        return HTMLResponse(html)

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>WhatsApp QR — Promo Hunter</title>
    <style>
      body{{font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#eee}}
      img{{border:8px solid white;border-radius:8px;max-width:320px}}
      p{{color:#aaa;font-size:14px}}
    </style>
    </head><body>
    <h2>📱 Conectar WhatsApp</h2>
    <p>Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
    <img src="{qr_b64}" alt="QR Code" />
    <p>O QR expira em ~30s — a página recarrega automaticamente.</p>
    <script>setTimeout(()=>location.reload(), 20000);</script>
    </body></html>"""
    return HTMLResponse(html)


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
