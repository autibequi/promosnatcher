from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class GroupCreate(BaseModel):
    name: str
    description: str = ""
    search_prompt: str
    min_val: float
    max_val: float
    whatsapp_group_id: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    message_template: Optional[str] = None
    active: bool = True
    scan_interval: int = 30


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    search_prompt: Optional[str] = None
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    whatsapp_group_id: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    message_template: Optional[str] = None
    active: Optional[bool] = None
    scan_interval: Optional[int] = None


class GroupRead(BaseModel):
    id: int
    name: str
    description: str
    search_prompt: str
    min_val: float
    max_val: float
    whatsapp_group_id: Optional[str]
    wa_group_status: Optional[str]
    telegram_chat_id: Optional[str]
    tg_group_status: Optional[str]
    message_template: Optional[str]
    active: bool
    scan_interval: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProductRead(BaseModel):
    id: int
    group_id: int
    group_name: Optional[str] = None
    title: str
    price: float
    url: str
    image_url: Optional[str]
    source: str
    short_id: Optional[str]
    family_key: Optional[str]
    found_at: datetime
    sent_at: Optional[datetime]

    class Config:
        from_attributes = True


class ScanJobRead(BaseModel):
    id: int
    group_id: int
    started_at: datetime
    finished_at: Optional[datetime]
    products_found: int
    status: str
    error_msg: Optional[str]

    class Config:
        from_attributes = True


class ProductsPage(BaseModel):
    items: List[ProductRead]
    total: int
    limit: int
    offset: int


class AppConfigRead(BaseModel):
    wa_provider: str
    wa_base_url: Optional[str]
    wa_instance: Optional[str]
    global_interval: int
    send_start_hour: int
    send_end_hour: int
    ml_client_id: Optional[str]
    amz_tracking_id: Optional[str]
    ml_affiliate_tool_id: Optional[str]
    wa_group_prefix: Optional[str]
    alert_phone: Optional[str]
    use_short_links: bool
    # Telegram
    tg_enabled: bool
    tg_bot_username: Optional[str]
    tg_group_prefix: Optional[str]

    class Config:
        from_attributes = True


class AppConfigUpdate(BaseModel):
    wa_provider: Optional[str] = None
    wa_base_url: Optional[str] = None
    wa_api_key: Optional[str] = None
    wa_instance: Optional[str] = None
    global_interval: Optional[int] = None
    send_start_hour: Optional[int] = None
    send_end_hour: Optional[int] = None
    ml_client_id: Optional[str] = None
    ml_client_secret: Optional[str] = None
    amz_tracking_id: Optional[str] = None
    ml_affiliate_tool_id: Optional[str] = None
    wa_group_prefix: Optional[str] = None
    alert_phone: Optional[str] = None
    use_short_links: Optional[bool] = None
    # Telegram
    tg_enabled: Optional[bool] = None
    tg_bot_token: Optional[str] = None
    tg_group_prefix: Optional[str] = None


class PriceHistoryRead(BaseModel):
    id: int
    product_id: int
    price: float
    recorded_at: datetime

    class Config:
        from_attributes = True


class CreateWAGroupRequest(BaseModel):
    participants: list[str] = []


# --- Multi-Account ---

class WAAccountCreate(BaseModel):
    name: str
    provider: str = "evolution"
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    instance: Optional[str] = "default"
    group_prefix: Optional[str] = "Snatcher"

class WAAccountRead(BaseModel):
    id: int
    name: str
    provider: str
    base_url: Optional[str]
    instance: Optional[str]
    group_prefix: Optional[str]
    status: str
    active: bool
    created_at: datetime
    class Config:
        from_attributes = True

class WAAccountUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    instance: Optional[str] = None
    group_prefix: Optional[str] = None
    active: Optional[bool] = None

class TGAccountCreate(BaseModel):
    name: str
    bot_token: Optional[str] = None
    group_prefix: Optional[str] = "Snatcher"

class TGAccountRead(BaseModel):
    id: int
    name: str
    bot_username: Optional[str]
    group_prefix: Optional[str]
    active: bool
    created_at: datetime
    class Config:
        from_attributes = True

class TGAccountUpdate(BaseModel):
    name: Optional[str] = None
    bot_token: Optional[str] = None
    group_prefix: Optional[str] = None
    active: Optional[bool] = None


# ===========================================================================
# v2 Pipeline Schemas
# ===========================================================================

# --- SearchTerm ---

class SearchTermCreate(BaseModel):
    query: str
    queries: List[str] = []
    min_val: float = 0
    max_val: float = 9999
    sources: str = "all"
    crawl_interval: int = 30
    ml_affiliate_tool_id: Optional[str] = None
    amz_tracking_id: Optional[str] = None

class SearchTermUpdate(BaseModel):
    query: Optional[str] = None
    queries: Optional[List[str]] = None
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    sources: Optional[str] = None
    active: Optional[bool] = None
    crawl_interval: Optional[int] = None
    ml_affiliate_tool_id: Optional[str] = None
    amz_tracking_id: Optional[str] = None

class SearchTermRead(BaseModel):
    id: int
    query: str
    queries: str = "[]"  # JSON string — frontend parseia
    min_val: float
    max_val: float
    sources: str
    active: bool
    crawl_interval: int
    last_crawled_at: Optional[datetime]
    result_count: int
    created_at: datetime
    ml_affiliate_tool_id: Optional[str] = None
    amz_tracking_id: Optional[str] = None
    class Config:
        from_attributes = True


# --- Broadcast ---

class BroadcastCreate(BaseModel):
    text: str
    image_url: Optional[str] = None
    channel_ids: List[int] | str = "all"  # lista de IDs ou "all"

class BroadcastRead(BaseModel):
    id: int
    text: str
    image_url: Optional[str]
    channel_ids: str
    status: str
    sent_count: int
    sent_at: Optional[datetime]
    error_msg: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True

# --- CrawlResult ---

class CrawlResultRead(BaseModel):
    id: int
    search_term_id: int
    title: str
    price: float
    url: str
    image_url: Optional[str]
    source: str
    crawled_at: datetime
    catalog_variant_id: Optional[int]
    class Config:
        from_attributes = True

class CrawlResultsPage(BaseModel):
    items: List[CrawlResultRead]
    total: int
    limit: int
    offset: int

# --- CatalogProduct ---

class CatalogVariantRead(BaseModel):
    id: int
    catalog_product_id: int
    title: str
    variant_label: Optional[str]
    price: float
    url: str
    image_url: Optional[str]
    source: str
    first_seen_at: datetime
    last_seen_at: datetime
    class Config:
        from_attributes = True

class CatalogProductRead(BaseModel):
    id: int
    canonical_name: str
    brand: Optional[str]
    weight: Optional[str]
    image_url: Optional[str]
    lowest_price: Optional[float]
    lowest_price_url: Optional[str]
    lowest_price_source: Optional[str]
    tags: str  # JSON string
    variant_count: int = 0
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

class CatalogProductDetail(CatalogProductRead):
    variants: List[CatalogVariantRead] = []

class CatalogProductsPage(BaseModel):
    items: List[CatalogProductRead]
    total: int
    limit: int
    offset: int

class CatalogProductUpdate(BaseModel):
    brand: Optional[str] = None
    tags: Optional[str] = None  # JSON string

# --- GroupingKeyword ---

class GroupingKeywordCreate(BaseModel):
    keyword: str
    tag: str

class GroupingKeywordRead(BaseModel):
    id: int
    keyword: str
    tag: str
    active: bool
    class Config:
        from_attributes = True

# --- Channel ---

class ChannelCreate(BaseModel):
    name: str
    description: str = ""
    slug: Optional[str] = None
    message_template: Optional[str] = None
    send_start_hour: int = 8
    send_end_hour: int = 22
    digest_mode: bool = False
    digest_max_items: int = 5

class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    slug: Optional[str] = None
    message_template: Optional[str] = None
    send_start_hour: Optional[int] = None
    send_end_hour: Optional[int] = None
    digest_mode: Optional[bool] = None
    digest_max_items: Optional[int] = None
    active: Optional[bool] = None

class ChannelTargetRead(BaseModel):
    id: int
    channel_id: int
    provider: str
    chat_id: str
    name: Optional[str]
    invite_url: Optional[str]
    status: str
    class Config:
        from_attributes = True

class ChannelTargetCreate(BaseModel):
    provider: str
    chat_id: str
    name: Optional[str] = None
    invite_url: Optional[str] = None

class ChannelRuleCreate(BaseModel):
    match_type: str
    match_value: Optional[str] = None
    max_price: Optional[float] = None
    notify_new: bool = True
    notify_drop: bool = False
    notify_lowest: bool = False
    drop_threshold: float = 0.10

class ChannelRuleRead(BaseModel):
    id: int
    channel_id: int
    match_type: str
    match_value: Optional[str]
    max_price: Optional[float]
    notify_new: bool
    notify_drop: bool
    notify_lowest: bool
    drop_threshold: float
    active: bool
    class Config:
        from_attributes = True

class ChannelRead(BaseModel):
    id: int
    name: str
    description: str
    slug: Optional[str]
    message_template: Optional[str]
    send_start_hour: int
    send_end_hour: int
    digest_mode: bool = False
    digest_max_items: int = 5
    active: bool
    created_at: datetime
    targets: List[ChannelTargetRead] = []
    rules: List[ChannelRuleRead] = []
    sent_count: int = 0
    class Config:
        from_attributes = True
