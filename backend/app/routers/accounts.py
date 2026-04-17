"""CRUD para contas WhatsApp e Telegram (multi-account)."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import WAAccount, TGAccount
from ..schemas import (
    WAAccountCreate, WAAccountRead, WAAccountUpdate,
    TGAccountCreate, TGAccountRead, TGAccountUpdate,
)
from ..services.whatsapp.factory import get_adapter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/accounts", tags=["accounts"])


# --- WhatsApp Accounts ---

@router.get("/wa", response_model=list[WAAccountRead])
def list_wa_accounts(session: Session = Depends(get_session)):
    return session.exec(select(WAAccount).order_by(WAAccount.created_at.desc())).all()


@router.post("/wa", response_model=WAAccountRead, status_code=201)
def create_wa_account(data: WAAccountCreate, session: Session = Depends(get_session)):
    account = WAAccount(**data.model_dump())
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.get("/wa/{account_id}", response_model=WAAccountRead)
def get_wa_account(account_id: int, session: Session = Depends(get_session)):
    account = session.get(WAAccount, account_id)
    if not account:
        raise HTTPException(404, "WA account not found")
    return account


@router.put("/wa/{account_id}", response_model=WAAccountRead)
def update_wa_account(account_id: int, data: WAAccountUpdate, session: Session = Depends(get_session)):
    account = session.get(WAAccount, account_id)
    if not account:
        raise HTTPException(404, "WA account not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(account, field, value)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.delete("/wa/{account_id}", status_code=204)
def delete_wa_account(account_id: int, session: Session = Depends(get_session)):
    account = session.get(WAAccount, account_id)
    if not account:
        raise HTTPException(404, "WA account not found")
    session.delete(account)
    session.commit()


@router.get("/wa/{account_id}/status")
async def wa_account_status(account_id: int, session: Session = Depends(get_session)):
    """Status da sessão WA desta conta."""
    account = session.get(WAAccount, account_id)
    if not account:
        raise HTTPException(404, "WA account not found")
    adapter = get_adapter(account.provider, account.base_url or "", account.api_key or "", account.instance or "")
    if not adapter:
        return {"status": "NOT_CONFIGURED"}
    status = await adapter.get_session_status()
    # Atualiza status no DB
    new_status = "connected" if status.get("status") == "WORKING" else "disconnected"
    if account.status != new_status:
        account.status = new_status
        session.add(account)
        session.commit()
    return status


@router.get("/wa/{account_id}/groups")
async def wa_account_groups(account_id: int, session: Session = Depends(get_session)):
    """Lista grupos WA desta conta."""
    account = session.get(WAAccount, account_id)
    if not account:
        raise HTTPException(404, "WA account not found")
    adapter = get_adapter(account.provider, account.base_url or "", account.api_key or "", account.instance or "")
    if not adapter:
        raise HTTPException(400, "WA não configurado")
    groups = await adapter.list_groups()
    prefix = account.group_prefix or ""
    if prefix:
        groups = [g for g in groups if g.get("name", "").startswith(prefix)]
    return groups


@router.post("/wa/{account_id}/test")
async def wa_account_test(account_id: int, session: Session = Depends(get_session)):
    """Testa conexão WA."""
    account = session.get(WAAccount, account_id)
    if not account:
        raise HTTPException(404, "WA account not found")
    adapter = get_adapter(account.provider, account.base_url or "", account.api_key or "", account.instance or "")
    if not adapter:
        raise HTTPException(400, "Configuração incompleta")
    ok = await adapter.test_connection()
    return {"connected": ok}


# --- Telegram Accounts ---

@router.get("/tg", response_model=list[TGAccountRead])
def list_tg_accounts(session: Session = Depends(get_session)):
    return session.exec(select(TGAccount).order_by(TGAccount.created_at.desc())).all()


@router.post("/tg", response_model=TGAccountRead, status_code=201)
async def create_tg_account(data: TGAccountCreate, session: Session = Depends(get_session)):
    account = TGAccount(**data.model_dump())
    # Validar token se fornecido
    if data.bot_token:
        from ..services.whatsapp.telegram import TelegramAdapter
        adapter = TelegramAdapter(data.bot_token)
        me = await adapter.get_me()
        if not me:
            raise HTTPException(400, "Token Telegram inválido")
        account.bot_username = me.get("username")
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.get("/tg/{account_id}", response_model=TGAccountRead)
def get_tg_account(account_id: int, session: Session = Depends(get_session)):
    account = session.get(TGAccount, account_id)
    if not account:
        raise HTTPException(404, "TG account not found")
    return account


@router.put("/tg/{account_id}", response_model=TGAccountRead)
async def update_tg_account(account_id: int, data: TGAccountUpdate, session: Session = Depends(get_session)):
    account = session.get(TGAccount, account_id)
    if not account:
        raise HTTPException(404, "TG account not found")
    if data.bot_token:
        from ..services.whatsapp.telegram import TelegramAdapter
        adapter = TelegramAdapter(data.bot_token)
        me = await adapter.get_me()
        if not me:
            raise HTTPException(400, "Token Telegram inválido")
        account.bot_username = me.get("username")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(account, field, value)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.delete("/tg/{account_id}", status_code=204)
def delete_tg_account(account_id: int, session: Session = Depends(get_session)):
    account = session.get(TGAccount, account_id)
    if not account:
        raise HTTPException(404, "TG account not found")
    session.delete(account)
    session.commit()


@router.post("/tg/{account_id}/test")
async def tg_account_test(account_id: int, session: Session = Depends(get_session)):
    """Testa conexão com bot TG."""
    account = session.get(TGAccount, account_id)
    if not account or not account.bot_token:
        raise HTTPException(400, "Token não configurado")
    from ..services.whatsapp.telegram import TelegramAdapter
    adapter = TelegramAdapter(account.bot_token)
    me = await adapter.get_me()
    if not me:
        raise HTTPException(400, "Falha ao conectar")
    return {"ok": True, "me": me}
