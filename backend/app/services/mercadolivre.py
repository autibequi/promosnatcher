import asyncio
import re
import time
import httpx
import logging
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Cache de token OAuth (module-level, compartilhado entre chamadas)
_token_cache: dict = {"token": None, "expires_at": 0.0}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

_MLB_RE = re.compile(r"(MLB\d+)")


def make_affiliate_url(url: str, tool_id: str) -> str:
    """Retorna a URL do produto com parâmetros de afiliado ML."""
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}matt_tool={tool_id}&matt_source=affiliate"


# ---------------------------------------------------------------------------
# API oficial
# ---------------------------------------------------------------------------

async def _get_token(client_id: str, client_secret: str) -> str | None:
    """Obtém bearer token via client_credentials. Reutiliza cache enquanto válido."""
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"] - 60:
        return _token_cache["token"]
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(
                "https://api.mercadolibre.com/oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            )
        if r.status_code != 200:
            logger.warning("ml.token_error", extra={"status": r.status_code})
            return None
        data = r.json()
        _token_cache["token"] = data["access_token"]
        _token_cache["expires_at"] = now + data.get("expires_in", 21600)
        logger.info("ml.token_renewed")
        return _token_cache["token"]
    except Exception as e:
        logger.error("ml.token_failed", extra={"error": str(e)})
        return None


async def _search_api(
    query: str, min_val: float, max_val: float, token: str
) -> list[dict]:
    """Busca via API oficial do ML."""
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(
                "https://api.mercadolibre.com/sites/MLB/search",
                params={
                    "q": query,
                    "price_min": int(min_val),
                    "price_max": int(max_val),
                    "limit": 20,
                    "sort": "price_asc",
                },
                headers={"Authorization": f"Bearer {token}"},
            )
        if r.status_code != 200:
            logger.warning("ml.api_error", extra={"status": r.status_code})
            return []
        results = []
        for item in r.json().get("results", []):
            price = float(item.get("price", 0))
            if not (min_val <= price <= max_val):
                continue
            results.append({
                "title": item.get("title", ""),
                "price": price,
                "url": item.get("permalink", ""),
                "image_url": item.get("thumbnail"),
                "source": "mercadolivre",
            })
        return results
    except Exception as e:
        logger.error("ml.api_failed", extra={"error": str(e)})
        return []


# ---------------------------------------------------------------------------
# Scraping HTML (fallback)
# ---------------------------------------------------------------------------

def _build_url(query: str, min_val: float, max_val: float) -> str:
    slug = re.sub(r"\s+", "-", query.strip().lower())
    slug = re.sub(r"[^\w-]", "", slug)
    return (
        f"https://lista.mercadolivre.com.br/{slug}"
        f"_PriceRange_{int(min_val)}-{int(max_val)}_NoIndex_True"
    )


def _parse(html: str, min_val: float, max_val: float) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("div.poly-card--grid-card")
    results = []

    for card in cards:
        title_el = card.select_one(".poly-component__title")
        if not title_el:
            continue

        title = title_el.get_text(strip=True)

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
        # data-src é a imagem real; src pode ser placeholder de lazy-load
        img_url = (img_el.get("data-src") or img_el.get("src")) if img_el else None

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


# ---------------------------------------------------------------------------
# Entrypoint público
# ---------------------------------------------------------------------------

async def search(
    query: str,
    min_val: float,
    max_val: float,
    client_id: str | None = None,
    client_secret: str | None = None,
) -> list[dict]:
    # Tenta API oficial se credenciais configuradas
    if client_id and client_secret:
        token = await _get_token(client_id, client_secret)
        if token:
            results = await _search_api(query, min_val, max_val, token)
            if results:
                logger.info("ml.api_results", extra={"query": query, "count": len(results)})
                return results
            logger.warning("ml.api_empty_fallback", extra={"query": query})

    # Fallback: scraping HTML (com retry + backoff)
    url = _build_url(query, min_val, max_val)
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(
                timeout=20, headers=HEADERS, follow_redirects=True
            ) as client:
                resp = await client.get(url)
            if resp.status_code == 200:
                results = _parse(resp.text, min_val, max_val)
                logger.info("ml.scraping_results", extra={"query": query, "count": len(results)})
                return results
            if resp.status_code == 429:
                wait = 5 * (attempt + 1)
                logger.warning("ml.rate_limited", extra={"attempt": attempt + 1, "wait_s": wait})
                await asyncio.sleep(wait)
                continue
            logger.warning("ml.scraping_http_error", extra={"status": resp.status_code})
            break
        except Exception as e:
            if attempt < 2:
                logger.warning("ml.scraping_retry", extra={"attempt": attempt + 1, "error": str(e)})
                await asyncio.sleep(3 * (attempt + 1))
            else:
                logger.error("ml.scraping_failed", extra={"error": str(e)})
    return []
