import logging
import os

from .base import AmazonDriver

logger = logging.getLogger(__name__)

_DRIVER: AmazonDriver | None = None


def _build(name: str) -> AmazonDriver:
    if name == "curl_cffi":
        from .drivers.curl_cffi_driver import CurlCffiDriver
        return CurlCffiDriver()
    if name == "crawl4ai":
        from .drivers.crawl4ai_driver import Crawl4aiDriver
        return Crawl4aiDriver()
    raise ValueError(f"unknown AMAZON_DRIVER: {name}")


def get_driver() -> AmazonDriver:
    global _DRIVER
    if _DRIVER is None:
        name = os.getenv("AMAZON_DRIVER", "crawl4ai").strip().lower()
        _DRIVER = _build(name)
        logger.info("amazon.driver_selected", extra={"driver": _DRIVER.name})
    return _DRIVER


def set_driver(driver: AmazonDriver) -> None:
    """Injeção manual — útil pra testes."""
    global _DRIVER
    _DRIVER = driver
