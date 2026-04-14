from .waha import WAHAAdapter
from .base import WhatsAppAdapter


def get_adapter(
    provider: str,
    base_url: str,
    api_key: str,
    instance: str,
) -> WhatsAppAdapter | None:
    """Retorna o adapter WAHA. provider e instance são mantidos por compatibilidade."""
    if not base_url:
        return None
    return WAHAAdapter(base_url, api_key or "", instance or "default")
