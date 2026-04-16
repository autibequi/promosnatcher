"""CRUD Channels + Targets + Rules."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import Channel, ChannelTarget, ChannelRule
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
        data = ch.model_dump()
        data["targets"] = [t.model_dump() for t in targets]
        data["rules"] = [r.model_dump() for r in rules]
        result.append(data)
    return result


@router.post("", response_model=ChannelRead, status_code=201)
def create_channel(data: ChannelCreate, session: Session = Depends(get_session)):
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
    # Check duplicate
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
