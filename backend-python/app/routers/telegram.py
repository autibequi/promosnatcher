"""Rotas Telegram: configuração, status, discovery e linking."""
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select
from ..database import get_session
from ..models import AppConfig, TelegramChat, Group
from ..services.whatsapp.factory import get_tg_adapter
from ..services.auth import require_auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/config/tg", tags=["telegram"])


class LinkChatRequest(BaseModel):
    group_id: int


class ResolveChatRequest(BaseModel):
    handle: str


class SetTitleRequest(BaseModel):
    title: str


@router.get("/status")
async def tg_status(session: Session = Depends(get_session)):
    """Status da configuração Telegram."""
    config = session.get(AppConfig, 1)
    if not config:
        return {"configured": False, "enabled": False, "bot": None}

    return {
        "configured": bool(config.tg_bot_token),
        "enabled": config.tg_enabled,
        "bot": {
            "username": config.tg_bot_username,
        } if config.tg_bot_username else None,
    }


@router.post("/test")
async def tg_test(session: Session = Depends(get_session)):
    """Testa conexão com bot Telegram (getMe)."""
    config = session.get(AppConfig, 1)
    if not config or not config.tg_bot_token:
        raise HTTPException(status_code=400, detail="Token não configurado")

    adapter = get_tg_adapter(config)
    if not adapter:
        raise HTTPException(status_code=400, detail="Adapter não inicializado")

    me = await adapter.get_me()
    if not me:
        raise HTTPException(status_code=400, detail="Falha ao conectar ao bot")

    # Atualiza username se obteve via getMe
    if me.get("username") and not config.tg_bot_username:
        config.tg_bot_username = me["username"]
        session.add(config)
        session.commit()

    return {
        "ok": True,
        "me": me,
    }


@router.get("/chats")
async def tg_list_chats(
    linked: Optional[bool] = Query(None),
    session: Session = Depends(get_session),
):
    """Lista TelegramChats descobertos. ?linked=false pra só não-vinculados."""
    config = session.get(AppConfig, 1)
    if not config or not config.tg_enabled:
        raise HTTPException(status_code=400, detail="Telegram não habilitado")

    query = select(TelegramChat)
    if linked is False:
        query = query.where(TelegramChat.linked_group_id == None)
    elif linked is True:
        query = query.where(TelegramChat.linked_group_id != None)

    chats = session.exec(query).all()
    return [
        {
            "chat_id": c.chat_id,
            "type": c.type,
            "title": c.title,
            "username": c.username,
            "member_count": c.member_count,
            "is_admin": c.is_admin,
            "linked_group_id": c.linked_group_id,
            "linked_channel_id": c.linked_channel_id,
            "discovered_at": c.discovered_at.isoformat(),
            "last_seen_at": c.last_seen_at.isoformat(),
        }
        for c in chats
    ]


@router.post("/chats/{chat_id}/link")
async def tg_link_chat(
    chat_id: str,
    body: LinkChatRequest,
    session: Session = Depends(get_session),
):
    """Vincula TelegramChat a um Group."""
    config = session.get(AppConfig, 1)
    if not config or not config.tg_enabled:
        raise HTTPException(status_code=400, detail="Telegram não habilitado")

    tg_chat = session.get(TelegramChat, chat_id)
    if not tg_chat:
        raise HTTPException(status_code=404, detail="TelegramChat não encontrado")

    group = session.get(Group, body.group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group não encontrado")

    # Vincula
    tg_chat.linked_group_id = body.group_id
    group.telegram_chat_id = chat_id
    session.add(tg_chat)
    session.add(group)
    session.commit()

    return {"ok": True, "chat_id": chat_id, "group_id": body.group_id}


@router.delete("/chats/{chat_id}/link")
async def tg_unlink_chat(
    chat_id: str,
    session: Session = Depends(get_session),
):
    """Desvincula TelegramChat de um Group."""
    tg_chat = session.get(TelegramChat, chat_id)
    if not tg_chat:
        raise HTTPException(status_code=404, detail="TelegramChat não encontrado")

    if tg_chat.linked_group_id:
        group = session.get(Group, tg_chat.linked_group_id)
        if group:
            group.telegram_chat_id = None
            group.tg_group_status = None
            session.add(group)

    tg_chat.linked_group_id = None
    session.add(tg_chat)
    session.commit()

    return {"ok": True, "chat_id": chat_id}


@router.post("/chats/resolve")
async def tg_resolve_chat(
    body: ResolveChatRequest,
    session: Session = Depends(get_session),
):
    """Resolve @handle e adiciona em TelegramChat (se conseguir via bot.getChat)."""
    config = session.get(AppConfig, 1)
    if not config or not config.tg_bot_token:
        raise HTTPException(status_code=400, detail="Token não configurado")

    adapter = get_tg_adapter(config)
    if not adapter:
        raise HTTPException(status_code=400, detail="Adapter não inicializado")

    # Telegram permite @handle ou -100xxx
    handle = body.handle
    if not handle.startswith("@") and not handle.startswith("-"):
        handle = f"@{handle}"

    try:
        # Tenta obter chat do bot
        chat = await adapter._bot.get_chat(chat_id=handle)
        cid = str(chat.id)

        existing = session.get(TelegramChat, cid)
        if existing:
            existing.title = chat.title or existing.title
            existing.last_seen_at = datetime.utcnow()
            session.add(existing)
        else:
            session.add(TelegramChat(
                chat_id=cid,
                type=chat.type or "unknown",
                title=chat.title or "Sem título",
                username=chat.username,
            ))
        session.commit()
        return {
            "ok": True,
            "chat_id": cid,
            "title": chat.title,
            "type": chat.type,
        }
    except Exception as e:
        logger.error(f"TG resolve {handle}: {e}")
        raise HTTPException(status_code=400, detail=f"Falha ao resolver: {str(e)}")


@router.put("/chats/{chat_id}/title")
async def tg_set_title(
    chat_id: str,
    body: SetTitleRequest,
    session: Session = Depends(get_session),
):
    """Atualiza título do grupo Telegram."""
    config = session.get(AppConfig, 1)
    if not config or not config.tg_enabled:
        raise HTTPException(status_code=400, detail="Telegram não habilitado")

    tg_chat = session.get(TelegramChat, chat_id)
    if not tg_chat:
        raise HTTPException(status_code=404, detail="TelegramChat não encontrado")

    if not tg_chat.is_admin:
        raise HTTPException(status_code=403, detail="Bot não é admin do grupo")

    adapter = get_tg_adapter(config)
    if not adapter:
        raise HTTPException(status_code=400, detail="Adapter não inicializado")

    ok = await adapter.set_group_subject(chat_id, body.title)
    if ok:
        tg_chat.title = body.title
        session.add(tg_chat)
        session.commit()
        return {"ok": True, "new_title": body.title}
    else:
        raise HTTPException(status_code=400, detail="Falha ao atualizar título")


@router.get("/chats/{chat_id}/invite")
async def tg_get_invite(
    chat_id: str,
    session: Session = Depends(get_session),
):
    """Gera link de convite do grupo."""
    config = session.get(AppConfig, 1)
    if not config or not config.tg_enabled:
        raise HTTPException(status_code=400, detail="Telegram não habilitado")

    tg_chat = session.get(TelegramChat, chat_id)
    if not tg_chat:
        raise HTTPException(status_code=404, detail="TelegramChat não encontrado")

    if not tg_chat.is_admin:
        raise HTTPException(status_code=403, detail="Bot não é admin do grupo")

    adapter = get_tg_adapter(config)
    if not adapter:
        raise HTTPException(status_code=400, detail="Adapter não inicializado")

    link = await adapter.get_invite_link(chat_id)
    if link:
        return {"ok": True, "invite_link": link}
    else:
        raise HTTPException(status_code=400, detail="Falha ao gerar invite link")


@router.delete("/chats/{chat_id}")
async def tg_leave_chat(
    chat_id: str,
    session: Session = Depends(get_session),
):
    """Bot sai do grupo e remove do TelegramChat."""
    config = session.get(AppConfig, 1)
    if not config or not config.tg_enabled:
        raise HTTPException(status_code=400, detail="Telegram não habilitado")

    adapter = get_tg_adapter(config)
    if not adapter:
        raise HTTPException(status_code=400, detail="Adapter não inicializado")

    await adapter.leave_chat(chat_id)

    # Remove do DB
    tg_chat = session.get(TelegramChat, chat_id)
    if tg_chat:
        if tg_chat.linked_group_id:
            group = session.get(Group, tg_chat.linked_group_id)
            if group:
                group.telegram_chat_id = None
                group.tg_group_status = None
                session.add(group)
        session.delete(tg_chat)
        session.commit()

    return {"ok": True}


@router.get("/deeplink")
async def tg_deeplink(session: Session = Depends(get_session)):
    """Deep link para adicionar bot a grupo novo."""
    config = session.get(AppConfig, 1)
    if not config or not config.tg_bot_username:
        raise HTTPException(status_code=400, detail="Bot username não configurado")

    url = f"https://t.me/{config.tg_bot_username}?startgroup=true"
    return {"url": url}
