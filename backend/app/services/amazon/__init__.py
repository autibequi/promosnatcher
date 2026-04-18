"""Amazon scraping — driver plugável via env AMAZON_DRIVER.

Drivers disponíveis: crawl4ai (default), curl_cffi.
"""
from .parser import build_url, make_affiliate_url, parse_results
from .registry import get_driver, set_driver

# Backcompat: testes importam _parse_results
_parse_results = parse_results
_build_url = build_url


async def search(query: str, min_val: float, max_val: float) -> list[dict]:
    return await get_driver().search(query, min_val, max_val)


__all__ = [
    "search",
    "make_affiliate_url",
    "parse_results",
    "build_url",
    "get_driver",
    "set_driver",
    "_parse_results",
    "_build_url",
]
