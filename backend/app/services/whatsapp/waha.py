import base64
import asyncio
import logging
import httpx
from .base import WhatsAppAdapter

logger = logging.getLogger(__name__)


class WAHAAdapter(WhatsAppAdapter):
    def __init__(self, base_url: str, api_key: str, session: str):
        self.base_url = base_url.rstrip("/")
        self.session = session or "default"
        self._headers = {"X-Api-Key": api_key} if api_key else {}

    # -------------------------------------------------------------------------
    # Core (required by base)
    # -------------------------------------------------------------------------

    async def send_text(self, phone: str, text: str) -> bool:
        url = f"{self.base_url}/api/sendText"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.post(url, json={
                    "session": self.session,
                    "chatId": phone,
                    "text": text,
                }, headers=self._headers)
                return r.status_code in (200, 201)
        except Exception as e:
            logger.error(f"WAHA send_text error: {e}")
            return False

    async def create_group(self, name: str, participants: list[str]) -> str | None:
        url = f"{self.base_url}/api/{self.session}/groups"
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=20) as c:
                    r = await c.post(url, json={
                        "title": name,
                        "participants": participants,
                    }, headers=self._headers)
                if r.status_code in (200, 201):
                    data = r.json()
                    gid = data.get("gid") or {}
                    group_id = gid.get("_serialized") or data.get("id") or data.get("chatId")
                    if group_id:
                        # WAHA NOWEB ignora o 'title' na criação — seta o subject separadamente
                        await self._set_group_subject(group_id, name)
                    return group_id
                logger.warning(f"WAHA create_group attempt {attempt+1}: {r.status_code} {r.text[:200]}")
                await asyncio.sleep(3)
            except Exception as e:
                logger.error(f"WAHA create_group: {e}")
                await asyncio.sleep(2)
        return None

    async def _set_group_subject(self, group_id: str, name: str) -> bool:
        url = f"{self.base_url}/api/{self.session}/groups/{group_id}/subject"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.put(url, json={"subject": name},
                                headers={**self._headers, "Content-Type": "application/json"})
            return r.status_code == 200
        except Exception as e:
            logger.warning(f"WAHA set_group_subject: {e}")
            return False

    async def test_connection(self) -> bool:
        status = await self.get_session_status()
        return status.get("status") == "WORKING"

    async def check_group(self, group_id: str) -> bool | None:
        url = f"{self.base_url}/api/{self.session}/groups/{group_id}"
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(url, headers=self._headers)
            if r.status_code == 200:
                return True
            if r.status_code == 404:
                return False
            return None
        except Exception:
            return None

    # -------------------------------------------------------------------------
    # WAHA-specific
    # -------------------------------------------------------------------------

    async def get_session_status(self) -> dict:
        """STOPPED | STARTING | SCAN_QR_CODE | WORKING | FAILED"""
        url = f"{self.base_url}/api/sessions/{self.session}"
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(url, headers=self._headers)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 404:
                return {"status": "STOPPED", "name": self.session}
            return {"status": "UNKNOWN"}
        except Exception as e:
            logger.warning(f"WAHA get_session_status: {e}")
            return {"status": "ERROR"}

    async def get_qr_code(self) -> str | None:
        """Retorna QR code como data URL base64 (PNG)."""
        url = f"{self.base_url}/api/{self.session}/auth/qr"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(url, params={"format": "image"},
                                headers=self._headers)
            if r.status_code == 200 and r.content:
                b64 = base64.b64encode(r.content).decode()
                return f"data:image/png;base64,{b64}"
            return None
        except Exception as e:
            logger.warning(f"WAHA get_qr_code: {e}")
            return None

    async def logout_session(self) -> bool:
        """Desconecta o WhatsApp (logout da sessão)."""
        url = f"{self.base_url}/api/sessions/{self.session}/logout"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.post(url, headers=self._headers)
            return r.status_code in (200, 201)
        except Exception as e:
            logger.error(f"WAHA logout_session: {e}")
            return False

    async def start_session(self) -> bool:
        """Cria ou inicia a sessão WAHA."""
        # Tenta criar primeiro
        url_create = f"{self.base_url}/api/sessions"
        url_start = f"{self.base_url}/api/sessions/{self.session}/start"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                # Cria a sessão (idempotente)
                await c.post(url_create,
                             json={"name": self.session},
                             headers=self._headers)
                # Inicia
                r = await c.post(url_start, headers=self._headers)
            return r.status_code in (200, 201)
        except Exception as e:
            logger.error(f"WAHA start_session: {e}")
            return False

    async def list_groups(self) -> list[dict]:
        """Lista todos os grupos onde o bot está membro."""
        url = f"{self.base_url}/api/{self.session}/groups"
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(url, headers=self._headers)
            if r.status_code == 200:
                data = r.json()
                results = []
                # WAHA retorna dict {jid: {id, subject, size, participants, ...}}
                # OU lista de objetos dependendo da versão
                items = data.values() if isinstance(data, dict) else data
                for g in items:
                    if isinstance(g, str):
                        continue  # pula strings avulsas
                    gid = g.get("id", "")
                    name = g.get("subject") or g.get("name") or "Sem nome"
                    size = g.get("size") or len(g.get("participants", []))
                    if gid:
                        results.append({"id": gid, "name": name, "size": size})
                return sorted(results, key=lambda x: x["name"].lower())
            logger.warning(f"WAHA list_groups: {r.status_code}")
            return []
        except Exception as e:
            logger.error(f"WAHA list_groups: {e}")
            return []
