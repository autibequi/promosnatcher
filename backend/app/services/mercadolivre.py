import re
import httpx
import logging

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
    """
    Extrai produtos do HTML da página de listagem do ML.
    Estrutura: poly-card com poly-component__title e andes-money-amount__fraction.
    """
    results = []

    # Extrair blocos de produto (cada poly-card)
    cards = re.split(r'class="poly-card', html)

    for card in cards[1:]:  # pula o primeiro (antes do primeiro card)
        # Título e URL
        title_match = re.search(
            r'class="poly-component__title"[^>]*>([^<]+)</a>', card
        )
        link_match = re.search(r'href="(https://www\.mercadolivre\.com\.br/[^"]+)"', card)

        if not title_match or not link_match:
            continue

        title = title_match.group(1).strip()
        url = link_match.group(1).split("?")[0]  # remove tracking params

        # Preço — inteiro + centavos
        price_int = re.search(r'andes-money-amount__fraction[^>]*>(\d[\d.]*)<', card)
        price_cents = re.search(r'andes-money-amount__cents[^>]*>(\d+)<', card)

        if not price_int:
            continue

        try:
            int_part = price_int.group(1).replace(".", "")
            cents_part = price_cents.group(1) if price_cents else "00"
            price = float(f"{int_part}.{cents_part}")
        except ValueError:
            continue

        if not (min_val <= price <= max_val):
            continue

        # Imagem
        img_match = re.search(r'poly-card__portada.*?src="([^"]+)"', card, re.DOTALL)
        img_url = img_match.group(1) if img_match else None

        if not any(r["url"] == url for r in results):
            results.append(
                {
                    "title": title,
                    "price": price,
                    "url": url,
                    "image_url": img_url,
                    "source": "mercadolivre",
                }
            )

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
