import re
import httpx
import logging
from bs4 import BeautifulSoup

_MLB_RE = re.compile(r"(MLB\d+)")

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def _build_url(query: str, min_val: float, max_val: float) -> str:
    """
    ML URL de busca com filtro de preço.
    Ex: https://lista.mercadolivre.com.br/whey-protein_PriceRange_50-200_NoIndex_True
    """
    slug = re.sub(r"\s+", "-", query.strip().lower())
    slug = re.sub(r"[^\w-]", "", slug)
    min_int = int(min_val)
    max_int = int(max_val)
    return f"https://lista.mercadolivre.com.br/{slug}_PriceRange_{min_int}-{max_int}_NoIndex_True"


def _parse(html: str, min_val: float, max_val: float) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    # ML usa div.poly-card--grid-card (não li)
    cards = soup.select("div.poly-card--grid-card")
    results = []

    for card in cards:
        title_el = card.select_one(".poly-component__title")
        if not title_el:
            continue

        title = title_el.get_text(strip=True)

        # URL: ML usa tracking links — extrai ID do produto do HTML do card
        m = _MLB_RE.search(str(card))
        if not m:
            continue
        url = f"https://www.mercadolivre.com.br/p/{m.group(1)}"

        price_int_el = card.select_one(".andes-money-amount__fraction")
        if not price_int_el:
            continue

        try:
            int_part = price_int_el.get_text(strip=True).replace(".", "")
            price_cents_el = card.select_one(".andes-money-amount__cents")
            cents_part = price_cents_el.get_text(strip=True) if price_cents_el else "00"
            price = float(f"{int_part}.{cents_part}")
        except ValueError:
            continue

        if not (min_val <= price <= max_val):
            continue

        img_el = card.select_one(".poly-card__portada img")
        img_url = (img_el.get("src") or img_el.get("data-src")) if img_el else None

        if not any(r["url"] == url for r in results):
            results.append({
                "title": title,
                "price": price,
                "url": url,
                "image_url": img_url,
                "source": "mercadolivre",
            })

        if len(results) >= 20:
            break

    return results


async def search(query: str, min_val: float, max_val: float) -> list[dict]:
    url = _build_url(query, min_val, max_val)
    try:
        async with httpx.AsyncClient(
            timeout=20, headers=HEADERS, follow_redirects=True
        ) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logger.warning(f"ML returned {resp.status_code} for {url}")
                return []
            return _parse(resp.text, min_val, max_val)
    except Exception as e:
        logger.error(f"Mercado Livre search error: {e}")
        return []
