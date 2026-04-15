from .evolution import EvolutionAdapter
from .base import WhatsAppAdapter


def get_adapter(
    provider: str,
    base_url: str,
    api_key: str,
    instance: str,
) -> WhatsAppAdapter | None:
    """Retorna o adapter Evolution API. provider mantido por compatibilidade."""
    if not base_url:
        return None
    return EvolutionAdapter(base_url, api_key or "", instance or "default")
