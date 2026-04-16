import secrets
import string
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, Relationship


def _gen_short_id(length: int = 7) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class Group(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: str = ""
    search_prompt: str
    min_val: float
    max_val: float
    whatsapp_group_id: Optional[str] = None
    wa_group_status: Optional[str] = None  # ok | removed | not_found | unchecked
    telegram_chat_id: Optional[str] = None  # "-100..." chat ID do Telegram
    tg_group_status: Optional[str] = None  # ok | removed | not_found | unchecked
    message_template: Optional[str] = None
    active: bool = True
    scan_interval: int = 30  # minutes
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    products: list["Product"] = Relationship(back_populates="group")
    scan_jobs: list["ScanJob"] = Relationship(back_populates="group")


class Product(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="group.id")
    title: str
    price: float
    url: str
    image_url: Optional[str] = None
    source: str  # "mercadolivre" | "amazon"
    short_id: str = Field(default_factory=_gen_short_id, index=True)
    family_key: Optional[str] = None  # título normalizado para agrupar variantes
    found_at: datetime = Field(default_factory=datetime.utcnow)
    sent_at: Optional[datetime] = None

    group: Optional[Group] = Relationship(back_populates="products")
    price_history: list["PriceHistory"] = Relationship(back_populates="product")
    click_logs: list["ClickLog"] = Relationship(back_populates="product")


class PriceHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="product.id")
    price: float
    recorded_at: datetime = Field(default_factory=datetime.utcnow)

    product: Optional[Product] = Relationship(back_populates="price_history")


class ScanJob(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="group.id")
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None
    products_found: int = 0
    status: str = "running"  # running | done | error
    error_msg: Optional[str] = None

    group: Optional[Group] = Relationship(back_populates="scan_jobs")


class AppConfig(SQLModel, table=True):
    id: int = Field(default=1, primary_key=True)
    wa_provider: str = "evolution"
    wa_base_url: Optional[str] = None
    wa_api_key: Optional[str] = None
    wa_instance: Optional[str] = None
    global_interval: int = 30
    send_start_hour: int = 8   # hora início envio WA (inclusive), fuso TZ_NAME
    send_end_hour: int = 22    # hora fim envio WA (exclusive)
    ml_client_id: Optional[str] = None
    ml_client_secret: Optional[str] = None
    wa_group_prefix: Optional[str] = "Snatcher"
    amz_tracking_id: Optional[str] = None
    ml_affiliate_tool_id: Optional[str] = None
    alert_phone: Optional[str] = None  # número WA do admin para alertas (ex: "5511999998888@c.us")
    use_short_links: bool = True  # False = envia link direto sem redirect/tracking
    # Telegram
    tg_enabled: bool = False
    tg_bot_token: Optional[str] = None  # 123456:ABC...
    tg_bot_username: Optional[str] = None  # "SnatcherBot"
    tg_group_prefix: Optional[str] = "Snatcher"
    tg_last_update_id: Optional[int] = None  # offset do getUpdates


class ClickLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="product.id", index=True)
    clicked_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    ip_hash: str = ""
    user_agent: str = ""
    referrer: str = ""

    product: Optional[Product] = Relationship(back_populates="click_logs")


class SentMessage(SQLModel, table=True):
    """Rastreamento de mensagens enviadas — dedup robusto pra multi-provider."""
    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="product.id", index=True)
    provider: str  # "whatsapp" | "telegram"
    chat_id: str  # JID do WA ou chat_id do TG
    is_drop: bool = False  # True se foi price drop
    sent_at: datetime = Field(default_factory=datetime.utcnow)


class TelegramChat(SQLModel, table=True):
    """Discovery cache — grupos/canais descobertos via polling."""
    chat_id: str = Field(primary_key=True)  # "-1001234567890"
    type: str  # "group" | "supergroup" | "channel"
    title: str
    username: Optional[str] = None  # "@canal_publico" se tiver
    member_count: Optional[int] = None
    is_admin: bool = False  # bot é admin?
    discovered_at: datetime = Field(default_factory=datetime.utcnow)
    last_seen_at: datetime = Field(default_factory=datetime.utcnow)
    linked_group_id: Optional[int] = Field(default=None, foreign_key="group.id")
