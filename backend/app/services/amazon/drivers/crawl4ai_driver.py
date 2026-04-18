import asyncio
import logging

from ..parser import build_url, parse_results

logger = logging.getLogger(__name__)


class Crawl4aiDriver:
    name = "crawl4ai"

    async def fetch_html(self, url: str) -> str | None:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

        browser_cfg = BrowserConfig(
            browser_type="chromium",
            headless=True,
            extra_args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-software-rasterizer",
            ],
        )
        run_cfg = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            js_code="window.scrollTo(0, document.body.scrollHeight);",
            delay_before_return_html=2.0,
            page_timeout=60000,
            simulate_user=True,
            magic=True,
        )

        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            result = await crawler.arun(url=url, config=run_cfg)

        if not result.success:
            logger.warning("amazon.crawl_failed", extra={"error": result.error_message})
            return None
        return result.html

    async def search(self, query: str, min_val: float, max_val: float) -> list[dict]:
        url = build_url(query, min_val, max_val)
        for attempt in range(2):
            try:
                html = await self.fetch_html(url)
                if not html:
                    if attempt == 0:
                        await asyncio.sleep(5)
                        continue
                    return []
                results = parse_results(html, min_val, max_val)
                if not results and attempt == 0:
                    logger.warning("amazon.empty_retry", extra={"driver": self.name})
                    await asyncio.sleep(5)
                    continue
                return results
            except Exception as e:
                if attempt == 0:
                    logger.warning("amazon.search_retry", extra={"driver": self.name, "error": str(e)})
                    await asyncio.sleep(5)
                else:
                    logger.error("amazon.search_failed", extra={"driver": self.name, "error": str(e)})
        return []
