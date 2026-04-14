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

    async def _get_own_jid(self) -> str | None:
        """Obtém o JID (número) do próprio bot para usar como participante inicial."""
        url = f"{self.base_url}/instance/fetchInstances"
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(url, headers=self._headers)
            if resp.status_code == 200:
                for inst in resp.json():
                    if inst.get("name") == self.instance:
                        jid = inst.get("ownerJid") or inst.get("owner")
                        if jid:
                            # normaliza para formato phone@s.whatsapp.net
                            return jid if "@" in jid else f"{jid}@s.whatsapp.net"
        except Exception:
            pass
        return None

    async def create_group(self, name: str, participants: list[str]) -> str | None:
        import asyncio

        # Obtém o próprio JID do bot
        if not participants:
            own_jid = await self._get_own_jid()
            participants = [own_jid] if own_jid else []

        if not participants:
            logger.error("Evolution create_group: não foi possível obter ownerJid")
            return None

        # Aguarda conexão estabilizar antes de operações complexas
        await asyncio.sleep(2)

        url = f"{self.base_url}/group/create/{self.instance}"
        payload = {"subject": name, "participants": participants}

        for attempt in range(4):
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(url, json=payload, headers=self._headers)

                if resp.status_code in (200, 201):
                    data = resp.json()
                    group_id = (
                        data.get("id")
                        or data.get("groupJid")
                        or (data.get("groupMetadata") or {}).get("id")
                    )
                    if group_id:
                        logger.info(f"Grupo WA criado: {group_id}")
                        return group_id

                body = resp.json()
                msg = str(body.get("response", {}).get("message", ""))
                logger.warning(f"Evolution create_group tentativa {attempt+1}/{4}: {resp.status_code} — {msg[:100]}")

                # Erros transientes: aguarda mais
                if any(k in msg for k in ["Timed Out", "Connection Closed", "timeout", "closed"]):
                    wait = (attempt + 1) * 5
                    logger.info(f"Aguardando {wait}s antes de tentar novamente...")
                    await asyncio.sleep(wait)
                    continue

                return None  # Erro não-transiente

            except Exception as e:
                logger.error(f"Evolution create_group exception: {e}")
                await asyncio.sleep(3)

        return None

    async def test_connection(self) -> bool:
        url = f"{self.base_url}/instance/connectionState/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(url, headers=self._headers)
                return resp.status_code == 200
        except Exception:
            return False

    async def check_group(self, group_id: str) -> bool | None:
        """Verifica se o grupo existe e o bot ainda é membro."""
        url = f"{self.base_url}/group/findGroupInfos/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(
                    url,
                    params={"groupJid": group_id},
                    headers=self._headers,
                )
            if resp.status_code == 200:
                return True
            if resp.status_code in (404, 400):
                return False
            return None
        except Exception as e:
            logger.warning(f"Evolution check_group error: {e}")
            return None
