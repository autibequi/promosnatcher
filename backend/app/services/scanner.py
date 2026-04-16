import asyncio
import json as _json
import logging
import os
import re
from datetime import datetime
from difflib import SequenceMatcher

import pytz
from sqlmodel import Session, select

from ..models import Group, Product, ScanJob, AppConfig, PriceHistory, SentMessage
from ..database import engine
from . import mercadolivre, amazon
from .whatsapp.factory import get_adapter, get_tg_adapter

logger = logging.getLogger(__name__)

DEFAULT_TEMPLATE = (
    "*{title}*\n\n"
    "{price}\n"
    "{url}"
)

PRICE_DROP_BADGE = "*QUEDA DE PREÇO*\n\n"

# ---------------------------------------------------------------------------
# Family grouping — agrupa variantes de sabor/cor do mesmo produto
# ---------------------------------------------------------------------------

_VARIANT_SUFFIXES = {
    # sabores
    "baunilha", "chocolate", "morango", "banana", "coco", "amendoim",
    "cookies", "brigadeiro", "cappuccino", "caramelo", "limao", "limão",
    "natural", "neutro", "original", "tradicional",
    "ninho", "avela", "avelã", "pistache", "cafe", "café",
    "menta", "laranja", "abacaxi", "uva", "maracuja", "maracujá",
    "baunilia",  # typo comum
    # cores
    "preto", "branco", "azul", "vermelho", "rosa", "cinza",
    "black", "white", "blue", "red", "pink", "grey",
}

_MULTI_WORD_VARIANTS = [
    "ninho c avela", "ninho c avelã", "ninho com avela", "ninho com avelã",
    "doce de leite", "torta de limao", "torta de limão",
    "frutas vermelhas", "cookies cream", "cookies and cream",
    "dulce de leche", "sem sabor",
]


def _normalize_title(title: str) -> str:
    """Normaliza título removendo variantes de sabor/cor para agrupamento."""
    t = title.lower().strip()
    # Remove conteúdo entre parênteses: "(Baunilha)", "(todos Os Sabores)"
    t = re.sub(r"\([^)]*\)", "", t)
    # Remove multi-word variants do final (checar mais longos primeiro)
    t_stripped = t.strip()
    for mv in sorted(_MULTI_WORD_VARIANTS, key=len, reverse=True):
        if t_stripped.endswith(mv):
            t_stripped = t_stripped[: -len(mv)]
            break
    t = t_stripped
    # Remove single-word variant suffixes do final
    words = t.split()
    while words and words[-1].strip("- /|,") in _VARIANT_SUFFIXES:
        words.pop()
    t = " ".join(words)
    # Limpa separadores e whitespace
    t = re.sub(r"[\s\-–—]+", " ", t).strip().rstrip("- /|,").strip()
    return t


def _compute_family_key(
    title: str,
    existing_keys: dict[str, str],
    threshold: float = 0.82,
) -> str:
    """Retorna family_key: match exato, fuzzy, ou nova key."""
    norm = _normalize_title(title)
    if norm in existing_keys:
        return existing_keys[norm]
    for key_norm, fk in existing_keys.items():
        if SequenceMatcher(None, norm, key_norm).ratio() >= threshold:
            return fk
    return norm


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
    # Short link (com tracking) ou link direto (sem tracking)
    use_short = config.use_short_links if config else True
    short_id = product.get("short_id")
    if use_short and short_id:
        public_url = os.getenv("PUBLIC_URL", "https://snatcher.autibequi.com")
        url = f"{public_url}/r/{short_id}"
    else:
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


def _collect_adapters(config: "AppConfig | None", group: "Group", session: "Session") -> list[tuple[str, object, list[str]]]:
    """Coleta adapters habilitados (WA + TG) e seus respectivos chat IDs."""
    result = []

    # WhatsApp
    wa_ids = _parse_group_ids(group.whatsapp_group_id)
    if wa_ids and config:
        wa = get_adapter(
            config.wa_provider,
            config.wa_base_url or "",
            config.wa_api_key or "",
            config.wa_instance or "",
        )
        if wa:
            result.append(("whatsapp", wa, wa_ids))

    # Telegram
    tg_ids = _parse_group_ids(group.telegram_chat_id)
    if tg_ids and config:
        tg = get_tg_adapter(config)
        if tg:
            result.append(("telegram", tg, tg_ids))

    return result


def _already_sent(session: "Session", product_id: int, provider: str, chat_id: str, is_drop: bool) -> bool:
    """Verifica se mensagem já foi enviada (dedup)."""
    if is_drop:
        return False  # drops sempre enviam

    existing = session.exec(
        select(SentMessage).where(
            SentMessage.product_id == product_id,
            SentMessage.provider == provider,
            SentMessage.chat_id == chat_id,
            SentMessage.is_drop == False,
        )
    ).first()
    return existing is not None


def _family_already_sent(session: "Session", family_key: str | None, group_id: int, provider: str, chat_id: str) -> bool:
    """Verifica se algum produto da mesma família já foi enviado neste chat."""
    if not family_key:
        return False
    existing = session.exec(
        select(SentMessage).join(
            Product, SentMessage.product_id == Product.id
        ).where(
            Product.family_key == family_key,
            Product.group_id == group_id,
            SentMessage.provider == provider,
            SentMessage.chat_id == chat_id,
            SentMessage.is_drop == False,
        )
    ).first()
    return existing is not None


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

            # Coleta adapters habilitados (WA + TG)
            adapters = _collect_adapters(config, group, session)

            # Health check para cada provider
            if adapters:
                # WA health check
                for provider, adapter, chat_ids in adapters:
                    if provider == "whatsapp" and chat_ids:
                        status = await adapter.check_group(chat_ids[0])
                        if status is True:
                            if group.wa_group_status != "ok":
                                group.wa_group_status = "ok"
                                session.add(group)
                        elif status is False:
                            logger.warning("scan.wa_group_removed", extra={"group_id": group_id})
                            group.wa_group_status = "removed"
                            session.add(group)
                            adapters = [(p, a, c) for p, a, c in adapters if p != "whatsapp"]
                    elif provider == "telegram" and chat_ids:
                        status = await adapter.check_group(chat_ids[0])
                        if status is True:
                            if group.tg_group_status != "ok":
                                group.tg_group_status = "ok"
                                session.add(group)
                        elif status is False:
                            logger.warning("scan.tg_group_removed", extra={"group_id": group_id})
                            group.tg_group_status = "removed"
                            session.add(group)
                            adapters = [(p, a, c) for p, a, c in adapters if p != "telegram"]

            # Pré-computa family_keys existentes para agrupamento
            existing_fks: dict[str, str] = {}
            for p in existing.values():
                norm = _normalize_title(p.title)
                existing_fks[norm] = p.family_key or norm

            # Calcula family_key e identifica representante (mais barato) por família
            # em uma única passagem — evita inconsistências por mutação do dicionário
            url_to_family_key: dict[str, str] = {}
            new_by_family: dict[str, list[dict]] = {}
            for item in all_results:
                if item["url"] not in existing:
                    fk = _compute_family_key(item["title"], existing_fks)
                    url_to_family_key[item["url"]] = fk
                    new_by_family.setdefault(fk, []).append(item)
                    existing_fks[_normalize_title(item["title"])] = fk
            representatives = set()
            for fk, items in new_by_family.items():
                cheapest = min(items, key=lambda x: x["price"])
                representatives.add(cheapest["url"])

            new_count = 0
            for item in all_results:
                stored = existing.get(item["url"])

                if stored is None:
                    # Produto novo — usar family_key já calculado
                    family_key = url_to_family_key[item["url"]]
                    product = Product(
                        group_id=group_id,
                        title=item["title"],
                        price=item["price"],
                        url=item["url"],
                        image_url=item.get("image_url"),
                        source=item["source"],
                        family_key=family_key,
                    )
                    session.add(product)
                    session.flush()  # obtém product.id + short_id
                    session.add(PriceHistory(product_id=product.id, price=item["price"]))

                    # Enviar multi-provider — só representante da família
                    is_representative = item["url"] in representatives
                    if is_representative and adapters and _within_send_window(config.send_start_hour, config.send_end_hour):
                        item_with_short = {**item, "short_id": product.short_id}
                        msg = _format_message(item_with_short, group.name, group.message_template, config=config)
                        img = item.get("image_url")
                        any_sent = False
                        for provider, adapter, chat_ids in adapters:
                            for cid in chat_ids:
                                if _family_already_sent(session, family_key, group_id, provider, cid):
                                    continue
                                ok = False
                                if img:
                                    ok = await adapter.send_image(cid, img, msg)
                                    if not ok:
                                        ok = await adapter.send_text(cid, msg)
                                else:
                                    ok = await adapter.send_text(cid, msg)
                                if ok:
                                    session.add(SentMessage(
                                        product_id=product.id,
                                        provider=provider,
                                        chat_id=cid,
                                        is_drop=False,
                                    ))
                                    any_sent = True
                        if any_sent:
                            product.sent_at = datetime.utcnow()

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
                            # Envia drop para todos os providers (sempre re-envia)
                            if adapters and _within_send_window(config.send_start_hour, config.send_end_hour):
                                item_with_short = {**item, "short_id": stored.short_id}
                                msg = _format_message(
                                    item_with_short, group.name, group.message_template, is_drop=True, config=config
                                )
                                img = item.get("image_url")
                                any_sent = False
                                for provider, adapter, chat_ids in adapters:
                                    for cid in chat_ids:
                                        ok = False
                                        if img:
                                            ok = await adapter.send_image(cid, img, msg)
                                            if not ok:
                                                ok = await adapter.send_text(cid, msg)
                                        else:
                                            ok = await adapter.send_text(cid, msg)
                                        if ok:
                                            session.add(SentMessage(
                                                product_id=stored.id,
                                                provider=provider,
                                                chat_id=cid,
                                                is_drop=True,
                                            ))
                                            any_sent = True
                                if any_sent:
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
