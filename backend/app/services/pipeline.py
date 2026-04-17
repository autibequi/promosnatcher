"""
Pipeline v2: CRAWL → PROCESS → EVALUATE

Step 1 (crawl): SearchTerm → CrawlResult
Step 2 (process): CrawlResult → CatalogProduct/Variant
Step 3 (evaluate): CatalogProduct + ChannelRule → send messages
"""
import asyncio
import json
import logging
import os
import re
from datetime import datetime

from zoneinfo import ZoneInfo
from sqlmodel import Session, select

from ..database import engine
from ..models import (
    SearchTerm, CrawlResult,
    CatalogProduct, CatalogVariant, PriceHistoryV2,
    GroupingKeyword, Channel, ChannelTarget, ChannelRule, SentMessageV2,
    AppConfig,
)
from . import mercadolivre, amazon
from .normalize import normalize_title, deaccent, WEIGHT_RE, is_variant_token, extract_brand, extract_weight, extract_variant_label
from .whatsapp.factory import get_adapter, get_tg_adapter

logger = logging.getLogger(__name__)

DEFAULT_TEMPLATE = (
    "*{title}*\n\n"
    "{price}\n"
    "{url}"
)


# ---------------------------------------------------------------------------
# Step 1: CRAWL
# ---------------------------------------------------------------------------

async def crawl_search_term(search_term_id: int):
    """Crawl um SearchTerm e salva resultados brutos."""
    with Session(engine) as session:
        term = session.get(SearchTerm, search_term_id)
        if not term or not term.active:
            return

        config = session.get(AppConfig, 1)
        results = []

        try:
            if term.sources in ("all", "mercadolivre"):
                try:
                    results += await mercadolivre.search(
                        term.query, term.min_val, term.max_val,
                        client_id=config.ml_client_id if config else None,
                        client_secret=config.ml_client_secret if config else None,
                    )
                except Exception as e:
                    logger.error("crawl.ml_error", extra={"term_id": term.id, "error": str(e)})
            if term.sources in ("all", "amazon"):
                try:
                    results += await amazon.search(term.query, term.min_val, term.max_val)
                except Exception as e:
                    logger.error("crawl.amz_error", extra={"term_id": term.id, "error": str(e)})

            # Salva cada resultado como CrawlResult raw
            for item in results:
                session.add(CrawlResult(
                    search_term_id=term.id,
                    title=item["title"],
                    price=item["price"],
                    url=item["url"],
                    image_url=item.get("image_url"),
                    source=item["source"],
                ))

            term.last_crawled_at = datetime.utcnow()
            term.result_count = len(results)
            session.add(term)
            session.commit()
            logger.info("crawl.done", extra={"term_id": term.id, "count": len(results)})

        except Exception as e:
            session.rollback()
            logger.error("crawl.error", extra={"term_id": term.id, "error": str(e)})


async def crawl_all_terms():
    """Crawl todos os SearchTerms ativos."""
    with Session(engine) as session:
        terms = session.exec(select(SearchTerm).where(SearchTerm.active == True)).all()

    sem = asyncio.Semaphore(3)

    async def _bounded(term_id):
        async with sem:
            await crawl_search_term(term_id)

    await asyncio.gather(*[_bounded(t.id) for t in terms], return_exceptions=True)


# ---------------------------------------------------------------------------
# Step 2: PROCESS — CrawlResult → CatalogProduct/Variant
# ---------------------------------------------------------------------------

def _find_catalog_product(
    normalized: str,
    session: Session,
    threshold: float = 0.80,
) -> CatalogProduct | None:
    """Encontra CatalogProduct existente por match exato ou fuzzy."""
    from difflib import SequenceMatcher

    # Exact match
    exact = session.exec(
        select(CatalogProduct).where(CatalogProduct.canonical_name == normalized)
    ).first()
    if exact:
        return exact

    # Fuzzy match contra todos os canônicos
    all_products = session.exec(select(CatalogProduct)).all()
    for p in all_products:
        if SequenceMatcher(None, normalized, p.canonical_name).ratio() >= threshold:
            return p
    return None


def process_crawl_results():
    """Transforma CrawlResults não processados em CatalogProduct/Variant."""
    with Session(engine) as session:
        unprocessed = session.exec(
            select(CrawlResult).where(CrawlResult.catalog_variant_id == None)
        ).all()

        if not unprocessed:
            return

        # Carrega keywords ativos
        keywords = session.exec(
            select(GroupingKeyword).where(GroupingKeyword.active == True)
        ).all()

        products_to_update = set()

        for cr in unprocessed:
            # 1. Find or create CatalogProduct
            normalized = normalize_title(cr.title)
            if not normalized:
                normalized = deaccent(cr.title.lower().strip())[:60]

            product = _find_catalog_product(normalized, session)
            if not product:
                product = CatalogProduct(
                    canonical_name=normalized,
                    brand=extract_brand(cr.title),
                    weight=extract_weight(cr.title),
                    image_url=cr.image_url,
                )
                session.add(product)
                session.flush()

            # 2. Find or create CatalogVariant (by URL)
            variant = session.exec(
                select(CatalogVariant).where(CatalogVariant.url == cr.url)
            ).first()

            if not variant:
                variant = CatalogVariant(
                    catalog_product_id=product.id,
                    title=cr.title,
                    variant_label=extract_variant_label(cr.title),
                    price=cr.price,
                    url=cr.url,
                    image_url=cr.image_url,
                    source=cr.source,
                )
                session.add(variant)
                session.flush()
                session.add(PriceHistoryV2(variant_id=variant.id, price=cr.price))
            else:
                # Preço mudou?
                if cr.price != variant.price:
                    session.add(PriceHistoryV2(variant_id=variant.id, price=cr.price))
                    variant.price = cr.price
                variant.last_seen_at = datetime.utcnow()
                session.add(variant)

            # 3. Apply GroupingKeywords
            title_lower = cr.title.lower()
            for kw in keywords:
                if kw.keyword.lower() in title_lower:
                    product.add_tag(kw.tag)

            # 4. Mark processed
            cr.catalog_variant_id = variant.id
            session.add(cr)
            products_to_update.add(product.id)

        # 5. Update aggregates para produtos modificados
        for pid in products_to_update:
            product = session.get(CatalogProduct, pid)
            if product:
                variants = session.exec(
                    select(CatalogVariant).where(CatalogVariant.catalog_product_id == pid)
                ).all()
                if variants:
                    cheapest = min(variants, key=lambda v: v.price)
                    product.lowest_price = cheapest.price
                    product.lowest_price_url = cheapest.url
                    product.lowest_price_source = cheapest.source
                    product.image_url = product.image_url or cheapest.image_url
                    product.updated_at = datetime.utcnow()
                    session.add(product)

        session.commit()
        logger.info("process.done", extra={"processed": len(unprocessed), "products_updated": len(products_to_update)})


# ---------------------------------------------------------------------------
# Step 3: EVALUATE — Channel Rules → Send
# ---------------------------------------------------------------------------

def _within_send_window(start_hour: int, end_hour: int) -> bool:
    tz = ZoneInfo(os.getenv("TZ_NAME", "America/Sao_Paulo"))
    now_hour = datetime.now(tz).hour
    return start_hour <= now_hour < end_hour


def _rule_matches_product(rule: ChannelRule, product: CatalogProduct, session: Session) -> bool:
    """Verifica se um produto satisfaz a regra."""
    if rule.match_type == "all":
        match = True
    elif rule.match_type == "tag":
        match = rule.match_value in product.get_tags()
    elif rule.match_type == "brand":
        match = (product.brand or "").lower() == (rule.match_value or "").lower()
    elif rule.match_type == "search_term":
        # Produto tem variantes que vieram deste search_term?
        match = session.exec(
            select(CrawlResult).join(CatalogVariant).where(
                CatalogVariant.catalog_product_id == product.id,
                CrawlResult.search_term_id == int(rule.match_value or 0),
            )
        ).first() is not None
    else:
        match = False

    if match and rule.max_price is not None:
        match = (product.lowest_price or 9999) <= rule.max_price

    return match


def _product_already_sent(session: Session, product_id: int, target_id: int, is_drop: bool) -> bool:
    """Dedup: já enviou este produto para este target?"""
    if is_drop:
        return False
    return session.exec(
        select(SentMessageV2).where(
            SentMessageV2.catalog_product_id == product_id,
            SentMessageV2.channel_target_id == target_id,
            SentMessageV2.is_drop == False,
        )
    ).first() is not None


def _format_channel_message(variant: CatalogVariant, product: CatalogProduct, template: str | None, is_drop: bool = False, config=None) -> str:
    """Formata mensagem para envio."""
    price_fmt = f"R$ {variant.price:.2f}".replace(".", ",")
    source_label = "Mercado Livre" if variant.source == "mercadolivre" else "Amazon"

    use_short = config.use_short_links if config else False
    url = variant.url
    if not use_short and config:
        if variant.source == "amazon" and config.amz_tracking_id:
            url = amazon.make_affiliate_url(url, config.amz_tracking_id)
        elif variant.source == "mercadolivre" and config.ml_affiliate_tool_id:
            url = mercadolivre.make_affiliate_url(url, config.ml_affiliate_tool_id)

    ctx = {
        "title": variant.title,
        "price": price_fmt,
        "url": url,
        "source": source_label,
        "brand": product.brand or "",
        "weight": product.weight or "",
        "image_url": variant.image_url or "",
    }

    tmpl = template or DEFAULT_TEMPLATE
    if is_drop:
        return "*QUEDA DE PREÇO*\n\n" + tmpl.format_map(ctx)
    return tmpl.format_map(ctx)


def _format_digest_message(items: list[tuple], channel_name: str) -> str:
    """Formata mensagem consolidada (digest) com top N produtos."""
    lines = [f"*Top {len(items)} ofertas — {channel_name}*\n"]
    for i, (variant, product) in enumerate(items, 1):
        price_fmt = f"R$ {variant.price:.2f}".replace(".", ",")
        source = "ML" if variant.source == "mercadolivre" else "AMZ"
        lines.append(f"{i}. {variant.title[:60]}")
        lines.append(f"   {price_fmt} ({source})")
        lines.append(f"   {variant.url}\n")
    return "\n".join(lines)


def _detect_events(variant: CatalogVariant, session: Session, drop_threshold: float = 0.10) -> set[str]:
    """Detecta eventos reais para uma variante: new, drop, lowest."""
    from datetime import timedelta
    events = set()

    # is_new: descoberto nas últimas 3h
    age = (datetime.utcnow() - variant.first_seen_at).total_seconds()
    if age < 10800:
        events.add("new")

    # Histórico de preço
    history = session.exec(
        select(PriceHistoryV2).where(PriceHistoryV2.variant_id == variant.id)
        .order_by(PriceHistoryV2.recorded_at.desc()).limit(20)
    ).all()

    if len(history) >= 2:
        prev_price = history[1].price
        # is_drop: preço caiu >= threshold vs anterior
        if prev_price > 0 and (prev_price - variant.price) / prev_price >= drop_threshold:
            events.add("drop")

    # is_lowest: preço atual é o menor de todo o histórico
    if history:
        min_ever = min(h.price for h in history)
        if variant.price <= min_ever:
            events.add("lowest")

    return events


async def evaluate_channels():
    """Para cada Channel ativo, avalia Rules contra catálogo e envia."""
    from datetime import timedelta

    with Session(engine) as session:
        config = session.get(AppConfig, 1)
        channels = session.exec(select(Channel).where(Channel.active == True)).all()

        for channel in channels:
            if not _within_send_window(channel.send_start_hour, channel.send_end_hour):
                continue

            targets = session.exec(
                select(ChannelTarget).where(
                    ChannelTarget.channel_id == channel.id,
                    ChannelTarget.status == "ok",
                )
            ).all()
            if not targets:
                continue

            rules = session.exec(
                select(ChannelRule).where(
                    ChannelRule.channel_id == channel.id,
                    ChannelRule.active == True,
                )
            ).all()
            if not rules:
                continue

            # Produtos atualizados recentemente (últimas 3h = janela do pipeline)
            recent_cutoff = datetime.utcnow() - timedelta(hours=3)
            recent_products = session.exec(
                select(CatalogProduct).where(CatalogProduct.updated_at >= recent_cutoff)
            ).all()

            # Coleta produtos que passam nas rules
            sendable: list[tuple] = []  # (product, cheapest_variant, is_drop)
            for product in recent_products:
                variants = session.exec(
                    select(CatalogVariant).where(
                        CatalogVariant.catalog_product_id == product.id
                    ).order_by(CatalogVariant.price.asc())
                ).all()
                if not variants:
                    continue
                cheapest = variants[0]

                for rule in rules:
                    if not _rule_matches_product(rule, product, session):
                        continue
                    events = _detect_events(cheapest, session, rule.drop_threshold)
                    should_send = (
                        ("new" in events and rule.notify_new) or
                        ("drop" in events and rule.notify_drop) or
                        ("lowest" in events and rule.notify_lowest)
                    )
                    if should_send:
                        sendable.append((product, cheapest, "drop" in events))
                        break

            if not sendable:
                continue

            sent_count = 0

            # Digest mode: acumula e envia 1 mensagem consolidada
            if channel.digest_mode:
                top_items = sorted(sendable, key=lambda x: x[1].price)[:channel.digest_max_items]
                digest_msg = _format_digest_message(
                    [(v, p) for p, v, _ in top_items], channel.name
                )
                for target in targets:
                    # Dedup: checa se TODOS os produtos já foram enviados
                    all_sent = all(_product_already_sent(session, p.id, target.id, d) for p, _, d in top_items)
                    if all_sent:
                        continue

                    adapter = None
                    if target.provider == "whatsapp" and config:
                        adapter = get_adapter(config.wa_provider, config.wa_base_url or "", config.wa_api_key or "", config.wa_instance or "")
                    elif target.provider == "telegram" and config:
                        adapter = get_tg_adapter(config)
                    if not adapter:
                        continue

                    ok = await adapter.send_text(target.chat_id, digest_msg)
                    if ok:
                        for p, _, d in top_items:
                            session.add(SentMessageV2(catalog_product_id=p.id, channel_target_id=target.id, is_drop=d))
                        sent_count += len(top_items)
            else:
                # Modo normal: 1 mensagem por produto
                for product, cheapest, is_drop in sendable:
                    for target in targets:
                        if _product_already_sent(session, product.id, target.id, is_drop):
                            continue

                        msg = _format_channel_message(
                            cheapest, product, channel.message_template,
                            is_drop=is_drop, config=config,
                        )

                        adapter = None
                        if target.provider == "whatsapp" and config:
                            adapter = get_adapter(
                                config.wa_provider, config.wa_base_url or "",
                                config.wa_api_key or "", config.wa_instance or "",
                            )
                        elif target.provider == "telegram" and config:
                            adapter = get_tg_adapter(config)

                        if not adapter:
                            continue

                        ok = False
                        img = cheapest.image_url
                        if img:
                            ok = await adapter.send_image(target.chat_id, img, msg)
                            if not ok:
                                ok = await adapter.send_text(target.chat_id, msg)
                        else:
                            ok = await adapter.send_text(target.chat_id, msg)

                        if ok:
                            session.add(SentMessageV2(
                                catalog_product_id=product.id,
                                channel_target_id=target.id,
                                is_drop=is_drop,
                            ))
                            sent_count += 1

                    break  # produto matchou uma rule, próximo produto

            session.commit()
            logger.info("evaluate.done", extra={"channel": channel.name, "sent": sent_count})


# ---------------------------------------------------------------------------
# Full pipeline: crawl all → process → evaluate
# ---------------------------------------------------------------------------

async def run_pipeline():
    """Executa o pipeline completo: crawl → process → evaluate."""
    process_crawl_results()  # processa resultados pendentes antes de crawlar
    try:
        await asyncio.wait_for(crawl_all_terms(), timeout=300)  # 5min max
    except asyncio.TimeoutError:
        logger.warning("crawl_all_terms timeout — avançando para process")
    except Exception as e:
        logger.error(f"crawl_all_terms error: {e}")
    process_crawl_results()  # processa os resultados novos
    await evaluate_channels()
