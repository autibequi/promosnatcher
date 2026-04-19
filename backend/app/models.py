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


class WAAccount(SQLModel, table=True):
    """Conta WhatsApp — permite múltiplas instâncias Evolution/WAHA."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str  # "Principal", "Backup", etc.
    provider: str = "evolution"
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    instance: Optional[str] = "default"
    group_prefix: Optional[str] = "Snatcher"
    status: str = "disconnected"  # connected | disconnected | error
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TGAccount(SQLModel, table=True):
    """Conta Telegram — permite múltiplos bots."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str  # "Bot Principal", etc.
    bot_token: Optional[str] = None
    bot_username: Optional[str] = None
    group_prefix: Optional[str] = "Snatcher"
    last_update_id: Optional[int] = None
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


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
    linked_group_id: Optional[int] = Field(default=None, foreign_key="group.id")  # legacy v1
    linked_channel_id: Optional[int] = Field(default=None, foreign_key="channel.id")


# ===========================================================================
# v2 Pipeline Models — CRAWL → CATALOG → DELIVER
# ===========================================================================

class SearchTerm(SQLModel, table=True):
    """Define o que buscar nos marketplaces."""
    id: Optional[int] = Field(default=None, primary_key=True)
    query: str  # "whey barato", "switch 2"
    min_val: float = 0
    max_val: float = 9999
    sources: str = "all"  # "all" | "amazon" | "mercadolivre"
    active: bool = True
    crawl_interval: int = 30  # minutos
    last_crawled_at: Optional[datetime] = None
    result_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    crawl_results: list["CrawlResult"] = Relationship(back_populates="search_term")


class CrawlResult(SQLModel, table=True):
    """Resultado bruto de cada crawl — raw view."""
    id: Optional[int] = Field(default=None, primary_key=True)
    search_term_id: int = Field(foreign_key="searchterm.id", index=True)
    title: str
    price: float
    url: str
    image_url: Optional[str] = None
    source: str  # "amazon" | "mercadolivre"
    crawled_at: datetime = Field(default_factory=datetime.utcnow)
    catalog_variant_id: Optional[int] = Field(default=None, foreign_key="catalogvariant.id")

    search_term: Optional[SearchTerm] = Relationship(back_populates="crawl_results")


class CatalogProduct(SQLModel, table=True):
    """Produto canônico — agrupa variantes de sabor/cor/tamanho."""
    id: Optional[int] = Field(default=None, primary_key=True)
    canonical_name: str = Field(index=True)  # _normalize_title output
    brand: Optional[str] = None
    weight: Optional[str] = None  # "900g", "1kg"
    image_url: Optional[str] = None
    lowest_price: Optional[float] = None
    lowest_price_url: Optional[str] = None
    lowest_price_source: Optional[str] = None
    tags: str = "[]"  # JSON array: ["profit", "whey-isolado"]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    variants: list["CatalogVariant"] = Relationship(back_populates="catalog_product")

    def get_tags(self) -> list[str]:
        import json
        try:
            return json.loads(self.tags)
        except Exception:
            return []

    def add_tag(self, tag: str):
        import json
        tags = self.get_tags()
        if tag not in tags:
            tags.append(tag)
            self.tags = json.dumps(tags)

    def remove_tag(self, tag: str):
        import json
        tags = self.get_tags()
        if tag in tags:
            tags.remove(tag)
            self.tags = json.dumps(tags)

    def update_lowest_price(self):
        if not self.variants:
            return
        cheapest = min(self.variants, key=lambda v: v.price)
        self.lowest_price = cheapest.price
        self.lowest_price_url = cheapest.url
        self.lowest_price_source = cheapest.source
        self.image_url = self.image_url or cheapest.image_url
        self.updated_at = datetime.utcnow()


class CatalogVariant(SQLModel, table=True):
    """Variante individual — cada URL/sabor/cor com seu preço."""
    id: Optional[int] = Field(default=None, primary_key=True)
    catalog_product_id: int = Field(foreign_key="catalogproduct.id", index=True)
    title: str  # raw
    variant_label: Optional[str] = None  # "Baunilha", "Chocolate"
    price: float
    url: str = Field(unique=True)
    image_url: Optional[str] = None
    source: str  # "amazon" | "mercadolivre"
    first_seen_at: datetime = Field(default_factory=datetime.utcnow)
    last_seen_at: datetime = Field(default_factory=datetime.utcnow)

    catalog_product: Optional[CatalogProduct] = Relationship(back_populates="variants")
    price_history_v2: list["PriceHistoryV2"] = Relationship(back_populates="variant")


class PriceHistoryV2(SQLModel, table=True):
    """Histórico de preço por variante (v2)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    variant_id: int = Field(foreign_key="catalogvariant.id", index=True)
    price: float
    recorded_at: datetime = Field(default_factory=datetime.utcnow)

    variant: Optional[CatalogVariant] = Relationship(back_populates="price_history_v2")


class GroupingKeyword(SQLModel, table=True):
    """Palavra-chave → tag automática. Ex: keyword='profit', tag='profit'."""
    id: Optional[int] = Field(default=None, primary_key=True)
    keyword: str = Field(unique=True)
    tag: str
    active: bool = True


class Channel(SQLModel, table=True):
    """Canal de delivery — agrupa targets WA/TG + regras de envio."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = ""
    slug: Optional[str] = Field(default=None, unique=True, index=True)  # ex: "maroma"
    message_template: Optional[str] = None
    send_start_hour: int = 8
    send_end_hour: int = 22
    digest_mode: bool = False  # True = acumula e envia consolidado
    digest_max_items: int = 5  # quantos produtos no digest
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

    targets: list["ChannelTarget"] = Relationship(back_populates="channel")
    rules: list["ChannelRule"] = Relationship(back_populates="channel")


class ChannelTarget(SQLModel, table=True):
    """Target de mensagem — WA group ou TG chat vinculado a um Channel."""
    id: Optional[int] = Field(default=None, primary_key=True)
    channel_id: int = Field(foreign_key="channel.id", index=True)
    provider: str  # "whatsapp" | "telegram"
    chat_id: str  # WA JID ou TG chat_id
    name: Optional[str] = None       # label exibido no picker (ex: "Grupo Suplementos SP")
    invite_url: Optional[str] = None  # link estático do grupo (https://chat.whatsapp.com/... ou https://t.me/...)
    status: str = "ok"  # "ok" | "removed"

    channel: Optional[Channel] = Relationship(back_populates="targets")


class ChannelRule(SQLModel, table=True):
    """Regra de envio — define QUAL produto e QUANDO enviar."""
    id: Optional[int] = Field(default=None, primary_key=True)
    channel_id: int = Field(foreign_key="channel.id", index=True)
    match_type: str  # "tag" | "brand" | "search_term" | "all"
    match_value: Optional[str] = None  # "profit", "integralmedica", "3"
    max_price: Optional[float] = None
    notify_new: bool = True
    notify_drop: bool = False
    notify_lowest: bool = False
    drop_threshold: float = 0.10
    active: bool = True

    channel: Optional[Channel] = Relationship(back_populates="rules")


class SentMessageV2(SQLModel, table=True):
    """Rastreamento de mensagens v2 — FK pra CatalogVariant + ChannelTarget."""
    id: Optional[int] = Field(default=None, primary_key=True)
    catalog_product_id: int = Field(foreign_key="catalogproduct.id", index=True)
    channel_target_id: int = Field(foreign_key="channeltarget.id", index=True)
    is_drop: bool = False
    sent_at: datetime = Field(default_factory=datetime.utcnow)


class CrawlLog(SQLModel, table=True):
    """Log de execução de cada crawl por SearchTerm."""
    id: Optional[int] = Field(default=None, primary_key=True)
    search_term_id: int = Field(foreign_key="searchterm.id", index=True)
    started_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    finished_at: Optional[datetime] = None
    status: str = "running"  # running | done | error
    ml_count: int = 0
    amz_count: int = 0
    error_msg: Optional[str] = None
