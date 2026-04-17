import asyncio
import logging
from urllib.parse import urlencode
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


def make_affiliate_url(url: str, tracking_id: str) -> str:
    """Retorna a URL do produto com o tag de afiliado Amazon Associates."""
    from urllib.parse import urlparse, urlencode, urlunparse
    p = urlparse(url)
    return urlunparse(p._replace(query=urlencode({"tag": tracking_id}), fragment=""))


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
        # Título: Amazon removeu <a> dentro do <h2> — usar h2 span direto
        title_el = item.select_one("h2 span") or item.select_one(".a-text-normal")
        price_whole = item.select_one(".a-price-whole")
        price_frac = item.select_one(".a-price-fraction")
        # Link: busca âncora com href /dp/ (link do produto)
        link_el = item.select_one('a[href*="/dp/"]')
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

    # 2 tentativas — Chromium é caro, não vale mais que isso
    for attempt in range(2):
        try:
            from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

            browser_cfg = BrowserConfig(
                browser_type="chromium",
                headless=True,
                extra_args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",             # Pi não tem GPU — evita crash
                    "--disable-software-rasterizer",
                ],
            )
            run_cfg = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                js_code="window.scrollTo(0, document.body.scrollHeight);",
                delay_before_return_html=2.0,
                page_timeout=60000,              # ARM é mais lento — 60s
                simulate_user=True,
                magic=True,
            )

            async with AsyncWebCrawler(config=browser_cfg) as crawler:
                result = await crawler.arun(url=url, config=run_cfg)

            if not result.success:
                logger.warning("amazon.crawl_failed", extra={"attempt": attempt + 1, "error": result.error_message})
                if attempt == 0:
                    await asyncio.sleep(5)
                    continue
                return []

            results = _parse_results(result.html, min_val, max_val)
            if not results and attempt == 0:
                logger.warning("amazon.empty_retry", extra={"attempt": attempt + 1})
                await asyncio.sleep(5)
                continue
            return results

        except Exception as e:
            if attempt == 0:
                logger.warning("amazon.search_retry", extra={"attempt": attempt + 1, "error": str(e)})
                await asyncio.sleep(5)
            else:
                logger.error("amazon.search_failed", extra={"error": str(e)})

    return []
