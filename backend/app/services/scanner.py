import logging
from datetime import datetime
from sqlmodel import Session, select

from ..models import Group, Product, ScanJob, AppConfig
from ..database import engine
from . import mercadolivre, amazon
from .whatsapp.factory import get_adapter

logger = logging.getLogger(__name__)


def _format_message(product: dict, group_name: str) -> str:
    price = f"R$ {product['price']:.2f}".replace(".", ",")
    source_label = "Mercado Livre" if product["source"] == "mercadolivre" else "Amazon"
    return (
        f"🔥 *PROMOÇÃO — {group_name}*\n\n"
        f"📦 {product['title']}\n"
        f"💰 {price}\n"
        f"🏪 {source_label}\n\n"
        f"🔗 {product['url']}"
    )


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
            # Busca em paralelo
            ml_results = await mercadolivre.search(
                group.search_prompt, group.min_val, group.max_val
            )
            amz_results = await amazon.search(
                group.search_prompt, group.min_val, group.max_val
            )
            all_results = ml_results + amz_results

            # URLs já salvas para esse grupo (dedup)
            existing_urls = set(
                session.exec(
                    select(Product.url).where(Product.group_id == group_id)
                ).all()
            )

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
                if item["url"] in existing_urls:
                    continue

                sent_at = None
                if wa_adapter:
                    msg = _format_message(item, group.name)
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
                existing_urls.add(item["url"])
                new_count += 1

            job.products_found = new_count
            job.status = "done"
            job.finished_at = datetime.utcnow()
            session.add(job)
            session.commit()
            logger.info(f"Scan group {group_id}: {new_count} new products")

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
