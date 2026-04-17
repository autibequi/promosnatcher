"""
Migração v1 → v2: Group/Product → SearchTerm/CrawlResult/CatalogProduct/Variant/Channel/Target/Rule

Idempotente — pode rodar múltiplas vezes sem duplicar dados.
"""
import logging
from datetime import datetime
from sqlmodel import Session, select
from sqlalchemy import text

from ..database import engine
from ..models import (
    Group, Product, PriceHistory,
    SearchTerm, CrawlResult, CatalogProduct, CatalogVariant, PriceHistoryV2,
    Channel, ChannelTarget, ChannelRule,
)
from .scanner import _normalize_title, _parse_group_ids
from .pipeline import _find_catalog_product, _extract_brand, _extract_weight, _extract_variant_label

logger = logging.getLogger(__name__)


def migrate_v1_to_v2():
    """Migra dados do modelo v1 (Group/Product) para v2 (pipeline)."""
    with Session(engine) as session:
        groups = session.exec(select(Group)).all()
        if not groups:
            logger.info("migrate: no groups to migrate")
            return

        # Check if already migrated (heuristic: SearchTerm exists)
        existing_terms = session.exec(select(SearchTerm)).first()
        if existing_terms:
            logger.info("migrate: already migrated (SearchTerms exist), skipping")
            return

        stats = {"terms": 0, "channels": 0, "products": 0, "variants": 0}

        for group in groups:
            # --- 1. Group.search_prompt → SearchTerm ---
            term = SearchTerm(
                query=group.search_prompt,
                min_val=group.min_val,
                max_val=group.max_val,
                sources="all",
                crawl_interval=group.scan_interval,
                active=group.active,
                created_at=group.created_at,
                last_crawled_at=group.updated_at,
            )
            session.add(term)
            session.flush()
            stats["terms"] += 1

            # --- 2. Group → Channel + Targets ---
            channel = Channel(
                name=group.name,
                description=group.description,
                message_template=group.message_template,
                active=group.active,
                created_at=group.created_at,
            )
            session.add(channel)
            session.flush()
            stats["channels"] += 1

            # WA targets
            wa_ids = _parse_group_ids(group.whatsapp_group_id)
            for wa_id in wa_ids:
                session.add(ChannelTarget(
                    channel_id=channel.id,
                    provider="whatsapp",
                    chat_id=wa_id,
                    status=group.wa_group_status or "ok",
                ))

            # TG targets
            tg_ids = _parse_group_ids(group.telegram_chat_id)
            for tg_id in tg_ids:
                session.add(ChannelTarget(
                    channel_id=channel.id,
                    provider="telegram",
                    chat_id=tg_id,
                    status=group.tg_group_status or "ok",
                ))

            # Default rule: send products from this search term
            session.add(ChannelRule(
                channel_id=channel.id,
                match_type="search_term",
                match_value=str(term.id),
                notify_new=True,
                notify_drop=True,
                drop_threshold=0.10,
            ))

            # --- 3. Products → CrawlResult + CatalogProduct/Variant ---
            products = session.exec(
                select(Product).where(Product.group_id == group.id)
            ).all()

            for product in products:
                # CrawlResult (raw snapshot)
                cr = CrawlResult(
                    search_term_id=term.id,
                    title=product.title,
                    price=product.price,
                    url=product.url,
                    image_url=product.image_url,
                    source=product.source,
                    crawled_at=product.found_at,
                )
                session.add(cr)
                session.flush()

                # Find or create CatalogProduct
                normalized = _normalize_title(product.title)
                if not normalized:
                    normalized = product.title.lower().strip()[:60]

                catalog_product = _find_catalog_product(normalized, session)
                if not catalog_product:
                    catalog_product = CatalogProduct(
                        canonical_name=normalized,
                        brand=_extract_brand(product.title),
                        weight=_extract_weight(product.title),
                        image_url=product.image_url,
                        created_at=product.found_at,
                    )
                    session.add(catalog_product)
                    session.flush()
                    stats["products"] += 1

                # Find or create CatalogVariant (by URL)
                variant = session.exec(
                    select(CatalogVariant).where(CatalogVariant.url == product.url)
                ).first()

                if not variant:
                    variant = CatalogVariant(
                        catalog_product_id=catalog_product.id,
                        title=product.title,
                        variant_label=_extract_variant_label(product.title, normalized),
                        price=product.price,
                        url=product.url,
                        image_url=product.image_url,
                        source=product.source,
                        first_seen_at=product.found_at,
                        last_seen_at=product.found_at,
                    )
                    session.add(variant)
                    session.flush()
                    stats["variants"] += 1

                    # Migrate price history
                    old_history = session.exec(
                        select(PriceHistory).where(PriceHistory.product_id == product.id)
                    ).all()
                    for ph in old_history:
                        session.add(PriceHistoryV2(
                            variant_id=variant.id,
                            price=ph.price,
                            recorded_at=ph.recorded_at,
                        ))

                # Link CrawlResult to variant
                cr.catalog_variant_id = variant.id

                # Update CatalogProduct aggregates
                if catalog_product.lowest_price is None or product.price < catalog_product.lowest_price:
                    catalog_product.lowest_price = product.price
                    catalog_product.lowest_price_url = product.url
                    catalog_product.lowest_price_source = product.source
                    catalog_product.image_url = catalog_product.image_url or product.image_url

        session.commit()
        logger.info(f"migrate: done — {stats}")
        return stats
