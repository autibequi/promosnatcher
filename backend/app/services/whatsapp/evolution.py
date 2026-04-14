import httpx
import logging
from .base import WhatsAppAdapter

logger = logging.getLogger(__name__)


class EvolutionAdapter(WhatsAppAdapter):
    def __init__(self, base_url: str, api_key: str, instance: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.instance = instance

    @property
    def _headers(self) -> dict:
        return {"apikey": self.api_key, "Content-Type": "application/json"}

    async def send_text(self, phone: str, text: str) -> bool:
        url = f"{self.base_url}/message/sendText/{self.instance}"
        payload = {"number": phone, "textMessage": {"text": text}}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload, headers=self._headers)
                resp.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Evolution send_text error: {e}")
            return False

    async def create_group(self, name: str, participants: list[str]) -> str | None:
        url = f"{self.base_url}/group/create/{self.instance}"
        payload = {"subject": name, "participants": participants}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload, headers=self._headers)
                resp.raise_for_status()
                data = resp.json()
                return data.get("id") or data.get("groupJid")
        except Exception as e:
            logger.error(f"Evolution create_group error: {e}")
            return None

    async def test_connection(self) -> bool:
        url = f"{self.base_url}/instance/connectionState/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(url, headers=self._headers)
                return resp.status_code == 200
        except Exception:
            return False
