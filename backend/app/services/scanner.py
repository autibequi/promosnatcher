import asyncio
import logging
import os
from datetime import datetime
import pytz
from sqlmodel import Session, select

from ..models import Group, Product, ScanJob, AppConfig, PriceHistory
from ..database import engine
from . import mercadolivre, amazon
from .whatsapp.factory import get_adapter

logger = logging.getLogger(__name__)

DEFAULT_TEMPLATE = (
    "*{title}*\n\n"
    "{price}\n"
    "{url}"
)

PRICE_DROP_BADGE = "*QUEDA DE PREÇO*\n\n"


import json as _json


def _parse_group_ids(raw: str | None) -> list[str]:
    """Parseia whatsapp_group_id que pode ser: None, JID simples, ou JSON array."""
    if not raw:
        return []
    raw = raw.strip()
    if raw.startswith("["):
        try:
            ids = _json.loads(raw)
            return [i for i in ids if i]
        except Exception:
            pass
    return [raw] if raw else []


def _within_send_window(start_hour: int, end_hour: int) -> bool:
    tz = pytz.timezone(os.getenv("TZ_NAME", "America/Sao_Paulo"))
    now_hour = datetime.now(tz).hour
    return start_hour <= now_hour < end_hour


def _format_message(
    product: dict,
    group_name: str,
    template: str | None = None,
    is_drop: bool = False,
    config=None,
) -> str:
    price_fmt = f"R$ {product['price']:.2f}".replace(".", ",")
    source_label = "Mercado Livre" if product["source"] == "mercadolivre" else "Amazon"
    url = product["url"]
    if config:
        if product["source"] == "amazon" and config.amz_tracking_id:
            url = amazon.make_affiliate_url(url, config.amz_tracking_id)
        elif product["source"] == "mercadolivre" and config.ml_affiliate_tool_id:
            url = mercadolivre.make_affiliate_url(url, config.ml_affiliate_tool_id)
    ctx = {
        "title": product["title"],
        "price": price_fmt,
        "url": url,
        "source": source_label,
        "group_name": group_name,
        "image_url": product.get("image_url") or "",
    }
    tmpl = template or DEFAULT_TEMPLATE
    if is_drop:
        badge = PRICE_DROP_BADGE.format(group_name=group_name)
        body = tmpl.replace("🔥 *PROMOÇÃO — {group_name}*\n\n", "")
        return badge + body.format_map(ctx)
    return tmpl.format_map(ctx)


async def _maybe_send_failure_alert(
    group: "Group", config: "AppConfig | None", error_msg: str, session: "Session"
) -> None:
    """Envia WA ao alert_phone se os últimos 3 scans do grupo falharam."""
    if not (config and config.alert_phone and config.wa_base_url):
        return
    recent = session.exec(
        select(ScanJob)
        .where(ScanJob.group_id == group.id)
        .order_by(ScanJob.started_at.desc())
        .limit(3)
    ).all()
    if len(recent) < 3 or not all(j.status == "error" for j in recent):
        return
    adapter = get_adapter(
        config.wa_provider, config.wa_base_url, config.wa_api_key or "", config.wa_instance or ""
    )
    if adapter:
        msg = (
            f"⚠️ *Promo Snatcher — Alerta*\n\n"
            f"Grupo *{group.name}* falhou 3 scans consecutivos.\n\n"
            f"Último erro: {error_msg[:200]}"
        )
        await adapter.send_text(config.alert_phone, msg)
        logger.warning("scan.alert_sent", extra={"group_id": group.id})


async def scan_group(group_id: int):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group or not group.active:
            return

        job = ScanJob(group_id=group_id)
        session.add(job)
        session.commit()
        session.refresh(job)

        config = None
        try:
            config = session.get(AppConfig, 1)

            ml_results = await mercadolivre.search(
                group.search_prompt,
                group.min_val,
                group.max_val,
                client_id=config.ml_client_id if config else None,
                client_secret=config.ml_client_secret if config else None,
            )
            amz_results = await amazon.search(
                group.search_prompt, group.min_val, group.max_val
            )
            all_results = ml_results + amz_results

            # Dict url → Product para dedup e comparação de preço
            existing = {
                p.url: p
                for p in session.exec(
                    select(Product).where(Product.group_id == group_id)
                ).all()
            }

            wa_adapter = None
            wa_group_ids = _parse_group_ids(group.whatsapp_group_id)
            if config and wa_group_ids:
                wa_adapter = get_adapter(
                    config.wa_provider,
                    config.wa_base_url or "",
                    config.wa_api_key or "",
                    config.wa_instance or "",
                )
                # Health check no primeiro grupo
                if wa_adapter:
                    status = await wa_adapter.check_group(wa_group_ids[0])
                    if status is True:
                        if group.wa_group_status != "ok":
                            group.wa_group_status = "ok"
                            session.add(group)
                    elif status is False:
                        logger.warning("scan.wa_group_removed", extra={"group_id": group_id})
                        group.wa_group_status = "removed"
                        session.add(group)
                        wa_adapter = None  # não envia mais até o grupo ser revalidado
                    # status None = inconclusivo, mantém adapter e não altera status

            new_count = 0
            for item in all_results:
                stored = existing.get(item["url"])

                if stored is None:
                    # Produto novo
                    sent_at = None
                    if wa_adapter and _within_send_window(config.send_start_hour, config.send_end_hour):
                        msg = _format_message(item, group.name, group.message_template, config=config)
                        img = item.get("image_url")
                        for gid in wa_group_ids:
                            if img:
                                ok = await wa_adapter.send_image(gid, img, msg)
                                if not ok:  # fallback para texto
                                    ok = await wa_adapter.send_text(gid, msg)
                            else:
                                ok = await wa_adapter.send_text(gid, msg)
                            if ok:
                                sent_at = datetime.utcnow()

                    product = Product(
                        group_id=group_id,
                        title=item["title"],
                        price=item["price"],
                        url=item["url"],
                        image_url=item.get("image_url"),
                        source=item["source"],
                        sent_at=sent_at,
                    )
                    session.add(product)
                    session.flush()  # obtém product.id para o histórico
                    session.add(PriceHistory(product_id=product.id, price=item["price"]))
                    existing[item["url"]] = product
                    new_count += 1

                else:
                    # Produto conhecido — registrar qualquer mudança de preço
                    if item["price"] != stored.price:
                        session.add(PriceHistory(product_id=stored.id, price=item["price"]))

                        drop_pct = (
                            (stored.price - item["price"]) / stored.price
                            if stored.price > 0
                            else 0
                        )
                        if drop_pct >= 0.10:
                            logger.info("scan.price_drop", extra={
                                "group_id": group_id, "drop_pct": f"{drop_pct:.0%}", "url": item["url"]
                            })
                            stored.sent_at = None
                            if wa_adapter and _within_send_window(config.send_start_hour, config.send_end_hour):
                                msg = _format_message(
                                    item, group.name, group.message_template, is_drop=True, config=config
                                )
                                img = item.get("image_url")
                                for gid in wa_group_ids:
                                    if img:
                                        ok = await wa_adapter.send_image(gid, img, msg)
                                        if not ok:
                                            ok = await wa_adapter.send_text(gid, msg)
                                    else:
                                        ok = await wa_adapter.send_text(gid, msg)
                                    if ok:
                                        stored.sent_at = datetime.utcnow()
                            new_count += 1

                        # atualiza preço em qualquer mudança
                        stored.price = item["price"]
                        session.add(stored)

            job.products_found = new_count
            job.status = "done"
            job.finished_at = datetime.utcnow()
            session.add(job)
            session.commit()
            logger.info("scan.done", extra={"group_id": group_id, "product_count": new_count})

        except Exception as e:
            job.status = "error"
            job.error_msg = str(e)
            job.finished_at = datetime.utcnow()
            session.add(job)
            session.commit()
            logger.error("scan.error", extra={"group_id": group_id, "error": str(e)})
            await _maybe_send_failure_alert(group, config, str(e), session)


async def scan_all_groups():
    with Session(engine) as session:
        groups = session.exec(select(Group).where(Group.active == True)).all()

    if not groups:
        return

    # Semáforo: max 3 grupos simultâneos (Amazon usa Chromium — limita memória)
    sem = asyncio.Semaphore(3)

    async def _bounded(group_id: int):
        async with sem:
            await scan_group(group_id)

    await asyncio.gather(*[_bounded(g.id) for g in groups], return_exceptions=True)
