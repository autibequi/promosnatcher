import httpx
import logging
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


async def search(query: str, min_val: float, max_val: float) -> list[dict]:
    min_cents = int(min_val * 100)
    max_cents = int(max_val * 100)
    url = (
        f"https://www.amazon.com.br/s"
        f"?k={httpx.URL('', params={'k': query}).params['k']}"
        f"&rh=p_36%3A{min_cents}-{max_cents}"
        f"&sort=price-asc-rank"
    )
    # Build URL properly
    url = str(
        httpx.URL(
            "https://www.amazon.com.br/s",
            params={
                "k": query,
                "rh": f"p_36:{min_cents}-{max_cents}",
                "sort": "price-asc-rank",
            },
        )
    )

    try:
        async with httpx.AsyncClient(
            timeout=20, headers=HEADERS, follow_redirects=True
        ) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logger.warning(f"Amazon returned {resp.status_code}")
                return []
            html = resp.text
    except Exception as e:
        logger.error(f"Amazon search error: {e}")
        return []

    return _parse_results(html, min_val, max_val)


def _parse_results(html: str, min_val: float, max_val: float) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    items = soup.select('[data-component-type="s-search-result"]')
    results = []

    for item in items[:20]:
        title_el = item.select_one("h2 a span")
        price_whole = item.select_one(".a-price-whole")
        price_frac = item.select_one(".a-price-fraction")
        link_el = item.select_one("h2 a")
        img_el = item.select_one(".s-image")

        if not title_el or not price_whole or not link_el:
            continue

        try:
            price_str = price_whole.get_text(strip=True).replace(".", "").replace(",", "")
            frac_str = (price_frac.get_text(strip=True) if price_frac else "00").replace(",", "")
            price = float(f"{price_str}.{frac_str}")
        except ValueError:
            continue

        if not (min_val <= price <= max_val):
            continue

        href = link_el.get("href", "")
        product_url = f"https://www.amazon.com.br{href}" if href.startswith("/") else href

        results.append(
            {
                "title": title_el.get_text(strip=True),
                "price": price,
                "url": product_url.split("?")[0],  # remove tracking params
                "image_url": img_el.get("src") if img_el else None,
                "source": "amazon",
            }
        )

    return results
