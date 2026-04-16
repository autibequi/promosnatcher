from .evolution import EvolutionAdapter
from .telegram import TelegramAdapter
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


def get_tg_adapter(config) -> TelegramAdapter | None:
    """Cria TelegramAdapter se token configurado."""
    if not (config.tg_enabled and config.tg_bot_token):
        return None
    return TelegramAdapter(config.tg_bot_token, config.tg_bot_username or "")
