import random
import logging
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..database import get_session
from ..models import Group
from ..services.scanner import _parse_group_ids

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/groups")
def list_public_groups(session: Session = Depends(get_session)):
    """Lista grupos ativos com WA vinculado — público, sem auth."""
    groups = session.exec(
        select(Group)
        .where(Group.active == True)
        .where(Group.whatsapp_group_id.is_not(None))
    ).all()

    result = []
    for g in groups:
        wa_ids = _parse_group_ids(g.whatsapp_group_id)
        if wa_ids:
            result.append({
                "name": g.name,
                "description": g.description,
                "search_prompt": g.search_prompt,
            })

    random.shuffle(result)
    return result
