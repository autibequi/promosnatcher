import logging
import re
from telegram import Bot
from telegram.constants import ParseMode
from telegram.error import TelegramError, Forbidden, BadRequest
from .base import WhatsAppAdapter

logger = logging.getLogger(__name__)


def _to_html(text: str) -> str:
    """Converte markdown WA-style (*bold*) pra HTML do Telegram.

    Telegram HTML parse_mode aceita: <b>, <i>, <u>, <s>, <code>, <pre>, <a>.
    Escapa <, >, & primeiro, depois reconverte os *...* em <b>...</b>.
    """
    # 1. escape HTML
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # 2. *bold* → <b>bold</b>  (não-greedy, cuidado com asteriscos soltos)
    text = re.sub(r"\*([^*\n]+)\*", r"<b>\1</b>", text)
    # 3. _italic_ → <i>italic</i>
    text = re.sub(r"(?<!\w)_([^_\n]+)_(?!\w)", r"<i>\1</i>", text)
    return text


class TelegramAdapter(WhatsAppAdapter):
    def __init__(self, token: str, bot_username: str = ""):
        self.token = token
        self.bot_username = bot_username
        self._bot = Bot(token=token)

    async def send_text(self, chat_id: str, text: str) -> bool:
        try:
            await self._bot.send_message(
                chat_id=chat_id,
                text=_to_html(text),
                parse_mode=ParseMode.HTML,
                disable_web_page_preview=False,  # queremos preview dos links de produto
            )
            return True
        except Forbidden as e:
            logger.warning(f"TG send_text forbidden (bot removido?): {chat_id}")
            return False
        except TelegramError as e:
            logger.error(f"TG send_text: {e}")
            return False

    async def send_image(self, chat_id: str, image_url: str, caption: str = "") -> bool:
        try:
            await self._bot.send_photo(
                chat_id=chat_id,
                photo=image_url,
                caption=_to_html(caption) if caption else None,
                parse_mode=ParseMode.HTML if caption else None,
            )
            return True
        except BadRequest as e:
            # Telegram às vezes rejeita URL (muito grande, redirect, etc) → fallback texto
            logger.warning(f"TG send_photo rejected URL: {e} — fallback send_text")
            return False
        except TelegramError as e:
            logger.error(f"TG send_image: {e}")
            return False

    async def create_group(self, name, participants) -> str | None:
        # Bots não podem criar grupos — frontend usa deep-link
        return None

    async def test_connection(self) -> bool:
        try:
            me = await self._bot.get_me()
            return bool(me.username)
        except TelegramError:
            return False

    async def get_me(self) -> dict | None:
        try:
            me = await self._bot.get_me()
            return {"id": me.id, "username": me.username, "first_name": me.first_name}
        except TelegramError:
            return None

    async def check_group(self, chat_id: str) -> bool | None:
        try:
            await self._bot.get_chat(chat_id=chat_id)
            return True
        except Forbidden:
            return False   # bot foi removido
        except BadRequest as e:
            if "not found" in str(e).lower() or "chat not found" in str(e).lower():
                return False
            return None
        except TelegramError:
            return None

    async def list_groups(self) -> list[dict]:
        """Lê de TelegramChat (populado pelo polling). Adapter não consulta DB direto —
        roteador que puxa do session. Retorna [] aqui por simplicidade."""
        return []

    async def get_invite_link(self, chat_id: str) -> str | None:
        try:
            link = await self._bot.create_chat_invite_link(chat_id=chat_id)
            return link.invite_link
        except TelegramError as e:
            logger.warning(f"TG get_invite_link: {e}")
            return None

    async def leave_chat(self, chat_id: str) -> bool:
        try:
            return await self._bot.leave_chat(chat_id=chat_id)
        except TelegramError as e:
            logger.warning(f"TG leave_chat: {e}")
            return False

    async def set_group_subject(self, chat_id: str, title: str) -> bool:
        try:
            return await self._bot.set_chat_title(chat_id=chat_id, title=title)
        except TelegramError as e:
            logger.warning(f"TG set_chat_title: {e}")
            return False

    async def set_group_description(self, chat_id: str, description: str) -> bool:
        try:
            return await self._bot.set_chat_description(chat_id=chat_id, description=description)
        except TelegramError as e:
            logger.warning(f"TG set_chat_description: {e}")
            return False

    async def set_group_picture(self, chat_id: str, image_path: str) -> bool:
        import pathlib
        p = pathlib.Path(image_path)
        if not p.exists():
            return False
        try:
            with p.open("rb") as f:
                return await self._bot.set_chat_photo(chat_id=chat_id, photo=f)
        except TelegramError as e:
            logger.warning(f"TG set_chat_photo: {e}")
            return False

    async def get_updates(self, offset: int = 0, timeout: int = 25) -> list:
        """Long-polling pra discovery. Usado pelo worker tg_poll_updates."""
        try:
            return await self._bot.get_updates(
                offset=offset,
                timeout=timeout,
                allowed_updates=["message", "my_chat_member", "chat_member"],
            )
        except TelegramError as e:
            logger.error(f"TG get_updates: {e}")
            return []
