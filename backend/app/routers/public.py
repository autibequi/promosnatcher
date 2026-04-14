import random
import logging
import httpx
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..database import get_session
from ..models import Group, AppConfig
from ..services.scanner import _parse_group_ids
from ..services.whatsapp.factory import get_adapter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["public"])


async def _get_invite_link(adapter, group_id: str) -> str | None:
    try:
        url = f"{adapter.base_url}/api/{adapter.session}/groups/{group_id}/invite-code"
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(url, headers=adapter._headers)
        if r.status_code == 200:
            data = r.json()
            code = data.get("inviteCode") or data.get("code") or data.get("invite_code")
            return f"https://chat.whatsapp.com/{code}" if code else None
    except Exception:
        pass
    return None


@router.get("/groups")
async def list_public_groups(session: Session = Depends(get_session)):
    groups = session.exec(
        select(Group)
        .where(Group.active == True)
        .where(Group.whatsapp_group_id.is_not(None))
    ).all()

    if not groups:
        return []

    config = session.get(AppConfig, 1)
    adapter = None
    if config and config.wa_base_url:
        adapter = get_adapter(
            config.wa_provider, config.wa_base_url,
            config.wa_api_key or "", config.wa_instance or ""
        )

    result = []
    for g in groups:
        wa_ids = _parse_group_ids(g.whatsapp_group_id)
        if not wa_ids:
            continue

        invite_link = None
        if adapter:
            invite_link = await _get_invite_link(adapter, wa_ids[0])

        result.append({
            "name": g.name,
            "description": g.description,
            "search_prompt": g.search_prompt,
            "invite_link": invite_link,
        })

    random.shuffle(result)
    return result
