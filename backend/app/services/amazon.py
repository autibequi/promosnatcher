import logging
from urllib.parse import urlencode
from bs4 import BeautifulSoup
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

logger = logging.getLogger(__name__)


def _build_url(query: str, min_val: float, max_val: float) -> str:
    params = urlencode({
        "k": query,
        "rh": f"p_36:{int(min_val * 100)}-{int(max_val * 100)}",
        "sort": "price-asc-rank",
    })
    return f"https://www.amazon.com.br/s?{params}"


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
            price_str = (
                price_whole.get_text(strip=True)
                .replace(".", "")
                .replace(",", "")
                .rstrip(".")
            )
            frac_str = (
                price_frac.get_text(strip=True) if price_frac else "00"
            ).replace(",", "")
            price = float(f"{price_str}.{frac_str}")
        except ValueError:
            continue

        if not (min_val <= price <= max_val):
            continue

        href = link_el.get("href", "")
        product_url = (
            f"https://www.amazon.com.br{href}" if href.startswith("/") else href
        )

        results.append({
            "title": title_el.get_text(strip=True),
            "price": price,
            "url": product_url.split("?")[0],
            "image_url": img_el.get("src") if img_el else None,
            "source": "amazon",
        })

    return results


async def search(query: str, min_val: float, max_val: float) -> list[dict]:
    url = _build_url(query, min_val, max_val)

    browser_cfg = BrowserConfig(
        browser_type="chromium",
        headless=True,
        extra_args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",             # obrigatório em Docker
            "--disable-dev-shm-usage",  # evita crash em /dev/shm pequeno
        ],
    )
    run_cfg = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        wait_for="css:[data-component-type='s-search-result']",
        wait_for_timeout=15000,
        js_code="window.scrollTo(0, document.body.scrollHeight);",
        delay_before_return_html=2.0,
        page_timeout=30000,
        simulate_user=True,
        magic=True,
    )

    try:
        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            result = await crawler.arun(url=url, config=run_cfg)

        if not result.success:
            logger.warning(f"Amazon crawl failed: {result.error_message}")
            return []

        return _parse_results(result.html, min_val, max_val)

    except Exception as e:
        logger.error(f"Amazon search error: {e}")
        return []
