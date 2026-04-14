from .base import WhatsAppAdapter
from .evolution import EvolutionAdapter
from .zapi import ZApiAdapter
from .waha import WAHAAdapter


def get_adapter(
    provider: str,
    base_url: str,
    api_key: str,
    instance: str,
) -> WhatsAppAdapter | None:
    if not base_url:
        return None
    if provider == "waha":
        return WAHAAdapter(base_url, api_key or "", instance or "default")
    if not api_key or not instance:
        return None
    if provider == "evolution":
        return EvolutionAdapter(base_url, api_key, instance)
    if provider == "zapi":
        return ZApiAdapter(base_url, api_key, instance)
    return None
