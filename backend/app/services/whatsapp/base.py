from abc import ABC, abstractmethod


class WhatsAppAdapter(ABC):
    @abstractmethod
    async def send_text(self, phone: str, text: str) -> bool:
        """Envia mensagem de texto. phone = número ou group_id@g.us"""

    @abstractmethod
    async def create_group(self, name: str, participants: list[str]) -> str | None:
        """Cria grupo e retorna o group_id do WA ou None em caso de erro."""

    @abstractmethod
    async def test_connection(self) -> bool:
        """Verifica se a conexão com o provider está ok."""

    async def check_group(self, group_id: str) -> bool | None:
        """
        Verifica se o grupo ainda existe e o bot é membro.
        Retorna True (ok), False (removido/inexistente), None (erro/inconclusivo).
        Implementação padrão retorna None — cada adapter pode sobrescrever.
        """
        return None
