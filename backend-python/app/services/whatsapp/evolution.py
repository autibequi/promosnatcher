import base64
import logging
import httpx
from .base import WhatsAppAdapter

logger = logging.getLogger(__name__)

# Mapeia estados Evolution → estados internos (compatível com frontend existente)
_STATUS_MAP = {
    "open": "WORKING",
    "close": "STOPPED",
    "connecting": "STARTING",
}


class EvolutionAdapter(WhatsAppAdapter):
    """Adapter para Evolution API v2 (engine WHATSAPP-BAILEYS)."""

    def __init__(self, base_url: str, api_key: str, instance: str):
        self.base_url = base_url.rstrip("/")
        self.instance = instance or "default"
        self._headers = {"apikey": api_key} if api_key else {}

    # -------------------------------------------------------------------------
    # Mensagens
    # -------------------------------------------------------------------------

    async def send_text(self, phone: str, text: str) -> bool:
        url = f"{self.base_url}/message/sendText/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(url, json={
                    "number": phone,
                    "text": text,
                }, headers=self._headers)
                return r.status_code in (200, 201)
        except Exception as e:
            logger.error(f"Evolution send_text error: {e}")
            return False

    async def send_image(self, phone: str, image_url: str, caption: str = "") -> bool:
        """Envia imagem com legenda. Tenta URL direto; fallback base64."""
        url = f"{self.base_url}/message/sendMedia/{self.instance}"
        payload_base = {"number": phone, "mediatype": "image", "caption": caption}

        # 1. Tenta por URL (Evolution baixa a imagem)
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(url, json={
                    **payload_base, "media": image_url,
                }, headers=self._headers)
                if r.status_code in (200, 201):
                    return True
                logger.warning(f"Evolution send_image URL: {r.status_code} — tentando base64")
        except Exception as e:
            logger.warning(f"Evolution send_image URL falhou: {e} — tentando base64")

        # 2. Fallback: baixa e envia como base64
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                img_r = await c.get(image_url, follow_redirects=True,
                                    headers={"User-Agent": "Mozilla/5.0"})
                if img_r.status_code != 200:
                    return False
                mime = img_r.headers.get("content-type", "image/jpeg").split(";")[0]
                b64 = base64.b64encode(img_r.content).decode()
                r = await c.post(url, json={
                    **payload_base,
                    "media": f"data:{mime};base64,{b64}",
                    "mimetype": mime,
                }, headers=self._headers)
                return r.status_code in (200, 201)
        except Exception as e:
            logger.error(f"Evolution send_image base64 falhou: {e}")
            return False

    # -------------------------------------------------------------------------
    # Grupos
    # -------------------------------------------------------------------------

    async def create_group(self, name: str, participants: list[str]) -> str | None:
        url = f"{self.base_url}/group/create/{self.instance}"
        # Evolution exige pelo menos 1 participante — busca o próprio número se vazio
        if not participants:
            me = await self._get_own_number()
            participants = [me] if me else []
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.post(url, json={
                    "subject": name,
                    "participants": participants,
                }, headers=self._headers)
            if r.status_code in (200, 201):
                data = r.json()
                group_id = data.get("id") or data.get("groupJid")
                if group_id:
                    logger.info(f"Evolution grupo criado: {group_id} ({name})")
                return group_id
            logger.warning(f"Evolution create_group: {r.status_code} {r.text[:200]}")
        except Exception as e:
            logger.error(f"Evolution create_group: {e}")
        return None

    async def check_group(self, group_id: str) -> bool | None:
        url = f"{self.base_url}/group/findGroupInfos/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(url, params={"groupJid": group_id}, headers=self._headers)
            if r.status_code == 200:
                return True
            if r.status_code == 404:
                return False
            return None
        except Exception:
            return None

    async def list_groups(self) -> list[dict]:
        """Lista todos os grupos via fetchAllGroups; o router filtra pelo prefixo."""
        url = f"{self.base_url}/group/fetchAllGroups/{self.instance}?getParticipants=false"
        try:
            async with httpx.AsyncClient(timeout=120) as c:
                r = await c.get(url, headers=self._headers)
            if r.status_code == 200:
                data = r.json()
                items = data if isinstance(data, list) else []
                results = []
                for g in items:
                    gid = g.get("id", "")
                    name = g.get("subject") or g.get("name") or "Sem nome"
                    size = g.get("size") or len(g.get("participants", []))
                    if gid:
                        results.append({"id": gid, "name": name, "size": size})
                return sorted(results, key=lambda x: x["name"].lower())
        except Exception as e:
            logger.warning(f"Evolution list_groups fetchAll failed: {e}")
        return []

    async def get_invite_link(self, group_id: str) -> str | None:
        url = f"{self.base_url}/group/inviteCode/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(url, params={"groupJid": group_id}, headers=self._headers)
            if r.status_code == 200:
                data = r.json()
                return data.get("inviteUrl") or (
                    f"https://chat.whatsapp.com/{data['inviteCode']}" if data.get("inviteCode") else None
                )
        except Exception as e:
            logger.warning(f"Evolution get_invite_link: {e}")
        return None

    async def _set_group_subject(self, group_id: str, name: str) -> bool:
        url = f"{self.base_url}/group/updateGroupSubject/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.put(url, json={"groupJid": group_id, "subject": name},
                                headers=self._headers)
            return r.status_code == 200
        except Exception as e:
            logger.warning(f"Evolution set_group_subject: {e}")
            return False

    async def set_group_description(self, group_id: str, description: str) -> bool:
        url = f"{self.base_url}/group/updateGroupDescription/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.put(url, json={"groupJid": group_id, "description": description},
                                headers=self._headers)
            return r.status_code == 200
        except Exception as e:
            logger.warning(f"Evolution set_group_description: {e}")
            return False

    async def leave_group(self, group_id: str) -> bool:
        url = f"{self.base_url}/group/leaveGroup/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.delete(url, params={"groupJid": group_id}, headers=self._headers)
            return r.status_code in (200, 201)
        except Exception as e:
            logger.warning(f"Evolution leave_group: {e}")
            return False

    # -------------------------------------------------------------------------
    # Sessão / Instância
    # -------------------------------------------------------------------------

    async def _get_own_number(self) -> str | None:
        """Busca o próprio número da instância conectada."""
        url = f"{self.base_url}/instance/fetchInstances"
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(url, params={"instanceName": self.instance}, headers=self._headers)
            if r.status_code == 200:
                data = r.json()
                if data and isinstance(data, list):
                    owner = data[0].get("ownerJid") or data[0].get("number")
                    if owner:
                        return owner.split("@")[0] if "@" in str(owner) else str(owner)
        except Exception as e:
            logger.warning(f"Evolution _get_own_number: {e}")
        return None

    async def test_connection(self) -> bool:
        status = await self.get_session_status()
        return status.get("status") == "WORKING"

    async def get_session_status(self) -> dict:
        url = f"{self.base_url}/instance/connectionState/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(url, headers=self._headers)
            if r.status_code == 200:
                data = r.json()
                state = data.get("instance", {}).get("state", "close")
                return {"status": _STATUS_MAP.get(state, "STOPPED"), "name": self.instance, "engine": {"engine": "BAILEYS"}}
            if r.status_code == 404:
                return {"status": "STOPPED", "name": self.instance, "engine": {}}
            return {"status": "STOPPED", "name": self.instance, "engine": {}}
        except Exception as e:
            logger.warning(f"Evolution get_session_status: {e}")
            return {"status": "ERROR", "name": self.instance, "engine": {}}

    async def get_qr_code(self) -> str | None:
        url = f"{self.base_url}/instance/connect/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(url, headers=self._headers)
            if r.status_code == 200:
                data = r.json()
                # Evolution retorna base64 direto no campo "base64"
                b64 = data.get("base64")
                if b64:
                    return b64 if b64.startswith("data:") else f"data:image/png;base64,{b64}"
                # Se já conectado, retorna estado
                return None
            return None
        except Exception as e:
            logger.warning(f"Evolution get_qr_code: {e}")
            return None

    async def start_session(self) -> bool:
        """Cria instância (idempotente) e conecta."""
        url_create = f"{self.base_url}/instance/create"
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(url_create, json={
                    "instanceName": self.instance,
                    "integration": "WHATSAPP-BAILEYS",
                    "qrcode": True,
                    "rejectCall": False,
                    "groupsIgnore": False,
                    "alwaysOnline": True,
                    "readMessages": True,
                    "readStatus": False,
                    "syncFullHistory": False,
                }, headers=self._headers)
            return r.status_code in (200, 201)
        except Exception as e:
            logger.error(f"Evolution start_session: {e}")
            return False

    async def logout_session(self) -> bool:
        url = f"{self.base_url}/instance/logout/{self.instance}"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.delete(url, headers=self._headers)
            return r.status_code in (200, 201)
        except Exception as e:
            logger.error(f"Evolution logout_session: {e}")
            return False
