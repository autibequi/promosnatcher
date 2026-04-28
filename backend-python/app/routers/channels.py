"""CRUD Channels + Targets + Rules."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from ..database import get_session
from ..models import Channel, ChannelTarget, ChannelRule, SentMessageV2
from ..schemas import (
    ChannelCreate, ChannelUpdate, ChannelRead,
    ChannelTargetCreate, ChannelTargetRead,
    ChannelRuleCreate, ChannelRuleRead,
)

router = APIRouter(prefix="/channels", tags=["channels"])


# --- Channel CRUD ---

@router.get("", response_model=list[ChannelRead])
def list_channels(session: Session = Depends(get_session)):
    channels = session.exec(select(Channel).order_by(Channel.created_at.desc())).all()
    result = []
    for ch in channels:
        targets = session.exec(
            select(ChannelTarget).where(ChannelTarget.channel_id == ch.id)
        ).all()
        rules = session.exec(
            select(ChannelRule).where(ChannelRule.channel_id == ch.id)
        ).all()
        target_ids = [t.id for t in targets]
        sent_count = 0
        if target_ids:
            sent_count = session.scalar(
                select(func.count(SentMessageV2.id)).where(
                    SentMessageV2.channel_target_id.in_(target_ids)
                )
            ) or 0
        data = ch.model_dump()
        data["targets"] = [t.model_dump() for t in targets]
        data["rules"] = [r.model_dump() for r in rules]
        data["sent_count"] = sent_count
        result.append(data)
    return result


def _validate_slug(slug: str | None, session: Session, exclude_id: int | None = None):
    if not slug:
        return
    import re
    if not re.match(r'^[a-z0-9-]+$', slug):
        raise HTTPException(422, "Slug deve conter apenas letras minúsculas, números e hífens")
    existing = session.exec(select(Channel).where(Channel.slug == slug)).first()
    if existing and existing.id != exclude_id:
        raise HTTPException(409, f"Slug '{slug}' já está em uso")


@router.post("", response_model=ChannelRead, status_code=201)
def create_channel(data: ChannelCreate, session: Session = Depends(get_session)):
    _validate_slug(data.slug, session)
    ch = Channel(**data.model_dump())
    session.add(ch)
    session.commit()
    session.refresh(ch)
    return {**ch.model_dump(), "targets": [], "rules": []}


@router.get("/{channel_id}", response_model=ChannelRead)
def get_channel(channel_id: int, session: Session = Depends(get_session)):
    ch = session.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    targets = session.exec(
        select(ChannelTarget).where(ChannelTarget.channel_id == ch.id)
    ).all()
    rules = session.exec(
        select(ChannelRule).where(ChannelRule.channel_id == ch.id)
    ).all()
    data = ch.model_dump()
    data["targets"] = [t.model_dump() for t in targets]
    data["rules"] = [r.model_dump() for r in rules]
    return data


@router.put("/{channel_id}", response_model=ChannelRead)
def update_channel(channel_id: int, data: ChannelUpdate, session: Session = Depends(get_session)):
    ch = session.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    _validate_slug(data.slug, session, exclude_id=channel_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(ch, field, value)
    session.add(ch)
    session.commit()
    session.refresh(ch)
    return get_channel(channel_id, session)


@router.delete("/{channel_id}", status_code=204)
def delete_channel(channel_id: int, session: Session = Depends(get_session)):
    ch = session.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    # Cascade: delete targets and rules
    for t in session.exec(select(ChannelTarget).where(ChannelTarget.channel_id == ch.id)).all():
        session.delete(t)
    for r in session.exec(select(ChannelRule).where(ChannelRule.channel_id == ch.id)).all():
        session.delete(r)
    session.delete(ch)
    session.commit()


# --- ChannelTarget ---

@router.post("/{channel_id}/targets", response_model=ChannelTargetRead, status_code=201)
def add_target(channel_id: int, data: ChannelTargetCreate, session: Session = Depends(get_session)):
    ch = session.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    existing = session.exec(
        select(ChannelTarget).where(
            ChannelTarget.channel_id == channel_id,
            ChannelTarget.provider == data.provider,
            ChannelTarget.chat_id == data.chat_id,
        )
    ).first()
    if existing:
        raise HTTPException(409, "Target já existe neste channel")
    target = ChannelTarget(channel_id=channel_id, **data.model_dump())
    session.add(target)
    session.commit()
    session.refresh(target)
    return target


@router.patch("/{channel_id}/targets/{target_id}", response_model=ChannelTargetRead)
def update_target(channel_id: int, target_id: int, data: dict, session: Session = Depends(get_session)):
    from pydantic import BaseModel as BM
    target = session.get(ChannelTarget, target_id)
    if not target or target.channel_id != channel_id:
        raise HTTPException(404, "Target not found")
    allowed = {"invite_url", "name", "status"}
    for field, value in data.items():
        if field in allowed:
            setattr(target, field, value)
    session.add(target)
    session.commit()
    session.refresh(target)
    return target


@router.delete("/{channel_id}/targets/{target_id}", status_code=204)
def remove_target(channel_id: int, target_id: int, session: Session = Depends(get_session)):
    target = session.get(ChannelTarget, target_id)
    if not target or target.channel_id != channel_id:
        raise HTTPException(404, "Target not found")
    session.delete(target)
    session.commit()


# --- ChannelRule ---

@router.post("/{channel_id}/rules", response_model=ChannelRuleRead, status_code=201)
def add_rule(channel_id: int, data: ChannelRuleCreate, session: Session = Depends(get_session)):
    ch = session.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Channel not found")
    rule = ChannelRule(channel_id=channel_id, **data.model_dump())
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule


@router.put("/{channel_id}/rules/{rule_id}", response_model=ChannelRuleRead)
def update_rule(channel_id: int, rule_id: int, data: ChannelRuleCreate, session: Session = Depends(get_session)):
    rule = session.get(ChannelRule, rule_id)
    if not rule or rule.channel_id != channel_id:
        raise HTTPException(404, "Rule not found")
    for field, value in data.model_dump().items():
        setattr(rule, field, value)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule


@router.delete("/{channel_id}/rules/{rule_id}", status_code=204)
def delete_rule(channel_id: int, rule_id: int, session: Session = Depends(get_session)):
    rule = session.get(ChannelRule, rule_id)
    if not rule or rule.channel_id != channel_id:
        raise HTTPException(404, "Rule not found")
    session.delete(rule)
    session.commit()
