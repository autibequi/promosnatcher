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
    "🔥 *PROMOÇÃO — {group_name}*\n\n"
    "📦 {title}\n"
    "💰 {price}\n"
    "🏪 {source}\n\n"
    "🔗 {url}"
)

PRICE_DROP_BADGE = "🚨 *QUEDA DE PREÇO — {group_name}*\n\n"


def _within_send_window(start_hour: int, end_hour: int) -> bool:
    tz = pytz.timezone(os.getenv("TZ_NAME", "America/Sao_Paulo"))
    now_hour = datetime.now(tz).hour
    return start_hour <= now_hour < end_hour


def _format_message(
    product: dict,
    group_name: str,
    template: str | None = None,
    is_drop: bool = False,
) -> str:
    price_fmt = f"R$ {product['price']:.2f}".replace(".", ",")
    source_label = "Mercado Livre" if product["source"] == "mercadolivre" else "Amazon"
    ctx = {
        "title": product["title"],
        "price": price_fmt,
        "url": product["url"],
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


async def scan_group(group_id: int):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group or not group.active:
            return

        job = ScanJob(group_id=group_id)
        session.add(job)
        session.commit()
        session.refresh(job)

        try:
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

            config = session.get(AppConfig, 1)
            wa_adapter = None
            if config and group.whatsapp_group_id:
                wa_adapter = get_adapter(
                    config.wa_provider,
                    config.wa_base_url or "",
                    config.wa_api_key or "",
                    config.wa_instance or "",
                )

            new_count = 0
            for item in all_results:
                stored = existing.get(item["url"])

                if stored is None:
                    # Produto novo
                    sent_at = None
                    if wa_adapter and _within_send_window(config.send_start_hour, config.send_end_hour):
                        msg = _format_message(item, group.name, group.message_template)
                        ok = await wa_adapter.send_text(group.whatsapp_group_id, msg)
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
                            logger.info(
                                f"Price drop {drop_pct:.0%} on {item['url']} "
                                f"({stored.price:.2f} → {item['price']:.2f})"
                            )
                            stored.sent_at = None
                            if wa_adapter and _within_send_window(config.send_start_hour, config.send_end_hour):
                                msg = _format_message(
                                    item, group.name, group.message_template, is_drop=True
                                )
                                ok = await wa_adapter.send_text(group.whatsapp_group_id, msg)
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
            logger.info(f"Scan group {group_id}: {new_count} new/updated products")

        except Exception as e:
            job.status = "error"
            job.error_msg = str(e)
            job.finished_at = datetime.utcnow()
            session.add(job)
            session.commit()
            logger.error(f"Scan group {group_id} error: {e}")


async def scan_all_groups():
    with Session(engine) as session:
        groups = session.exec(select(Group).where(Group.active == True)).all()
    for group in groups:
        await scan_group(group.id)
