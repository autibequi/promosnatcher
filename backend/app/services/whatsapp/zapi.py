import httpx
import logging
from .base import WhatsAppAdapter

logger = logging.getLogger(__name__)


class ZApiAdapter(WhatsAppAdapter):
    def __init__(self, base_url: str, api_key: str, instance: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.instance = instance

    @property
    def _base(self) -> str:
        return f"{self.base_url}/instances/{self.instance}/token/{self.api_key}"

    async def send_text(self, phone: str, text: str) -> bool:
        url = f"{self._base}/send-text"
        payload = {"phone": phone, "message": text}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Z-API send_text error: {e}")
            return False

    async def create_group(self, name: str, participants: list[str]) -> str | None:
        url = f"{self._base}/create-group"
        payload = {"groupName": name, "phones": participants}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                return data.get("phone") or data.get("id")
        except Exception as e:
            logger.error(f"Z-API create_group error: {e}")
            return None

    async def test_connection(self) -> bool:
        url = f"{self._base}/status"
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(url)
                return resp.status_code == 200
        except Exception:
            return False
