"""Broadcast — envia mensagem livre para canais/grupos sem ser anúncio."""
import json
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException
from sqlmodel import Session, select

from ..database import engine
from ..models import BroadcastMessage, Channel, ChannelTarget, AppConfig
from ..schemas import BroadcastCreate, BroadcastRead
from ..services.whatsapp.factory import get_adapter, get_tg_adapter

router = APIRouter(prefix="/broadcast", tags=["broadcast"])
logger = logging.getLogger(__name__)


@router.get("", response_model=list[BroadcastRead])
def list_broadcasts():
    with Session(engine) as session:
        items = session.exec(
            select(BroadcastMessage).order_by(BroadcastMessage.created_at.desc()).limit(50)
        ).all()
        return items


@router.post("", response_model=BroadcastRead)
async def send_broadcast(body: BroadcastCreate):
    with Session(engine) as session:
        config = session.get(AppConfig, 1)

        # Resolve targets
        if body.channel_ids == "all":
            channels = session.exec(select(Channel).where(Channel.active == True)).all()
            channel_ids_json = "all"
        else:
            ids = body.channel_ids if isinstance(body.channel_ids, list) else []
            channels = session.exec(
                select(Channel).where(Channel.id.in_(ids), Channel.active == True)
            ).all()
            channel_ids_json = json.dumps(ids)

        broadcast = BroadcastMessage(
            text=body.text,
            image_url=body.image_url,
            channel_ids=channel_ids_json,
            status="pending",
        )
        session.add(broadcast)
        session.commit()
        session.refresh(broadcast)
        bcast_id = broadcast.id

    # Envia para todos os targets
    sent = 0
    errors = []

    with Session(engine) as session:
        config = session.get(AppConfig, 1)
        broadcast = session.get(BroadcastMessage, bcast_id)

        for channel in channels:
            targets = session.exec(
                select(ChannelTarget).where(
                    ChannelTarget.channel_id == channel.id,
                    ChannelTarget.status == "ok",
                )
            ).all()

            for target in targets:
                try:
                    adapter = None
                    if target.provider == "whatsapp" and config:
                        adapter = get_adapter(
                            config.wa_provider,
                            config.wa_base_url or "",
                            config.wa_api_key or "",
                            config.wa_instance or "",
                        )
                    elif target.provider == "telegram" and config:
                        adapter = get_tg_adapter(config)

                    if not adapter:
                        continue

                    ok = False
                    if body.image_url:
                        ok = await adapter.send_image(target.chat_id, body.image_url, body.text)
                        if not ok:
                            ok = await adapter.send_text(target.chat_id, body.text)
                    else:
                        ok = await adapter.send_text(target.chat_id, body.text)

                    if ok:
                        sent += 1
                    else:
                        errors.append(f"{target.provider}:{target.chat_id}")
                except Exception as e:
                    errors.append(f"{target.provider}:{target.chat_id}: {e}")
                    logger.error(f"broadcast.send_error target={target.id} err={e}")

        broadcast.status = "error" if (errors and not sent) else "sent"
        broadcast.sent_count = sent
        broadcast.sent_at = datetime.utcnow()
        if errors:
            broadcast.error_msg = "; ".join(errors[:5])
        session.add(broadcast)
        session.commit()
        session.refresh(broadcast)
        return broadcast


@router.delete("/{broadcast_id}")
def delete_broadcast(broadcast_id: int):
    with Session(engine) as session:
        item = session.get(BroadcastMessage, broadcast_id)
        if not item:
            raise HTTPException(status_code=404, detail="Not found")
        session.delete(item)
        session.commit()
    return {"ok": True}
