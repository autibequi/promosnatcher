import asyncio
import logging

from ..parser import build_url, parse_results

logger = logging.getLogger(__name__)


class CurlCffiDriver:
    """Scraper leve baseado em curl_cffi (TLS fingerprint de Chrome real).

    Não roda browser — ideal para Raspberry Pi / ARM.
    Requer: pip install curl_cffi
    """

    name = "curl_cffi"

    async def fetch_html(self, url: str) -> str | None:
        from curl_cffi import requests as cffi_requests

        def _get() -> str | None:
            resp = cffi_requests.get(
                url,
                impersonate="chrome124",
                timeout=30,
                headers={
                    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
                },
            )
            if resp.status_code != 200:
                logger.warning("amazon.curl_cffi_status", extra={"status": resp.status_code})
                return None
            return resp.text

        return await asyncio.to_thread(_get)

    async def search(self, query: str, min_val: float, max_val: float) -> list[dict]:
        url = build_url(query, min_val, max_val)
        for attempt in range(2):
            try:
                html = await self.fetch_html(url)
                if not html:
                    if attempt == 0:
                        await asyncio.sleep(3)
                        continue
                    return []
                results = parse_results(html, min_val, max_val)
                if not results and attempt == 0:
                    logger.warning("amazon.empty_retry", extra={"driver": self.name})
                    await asyncio.sleep(3)
                    continue
                return results
            except Exception as e:
                if attempt == 0:
                    logger.warning("amazon.search_retry", extra={"driver": self.name, "error": str(e)})
                    await asyncio.sleep(3)
                else:
                    logger.error("amazon.search_failed", extra={"driver": self.name, "error": str(e)})
        return []
