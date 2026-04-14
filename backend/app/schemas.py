from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class GroupCreate(BaseModel):
    name: str
    description: str = ""
    search_prompt: str
    min_val: float
    max_val: float
    whatsapp_group_id: Optional[str] = None
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
    title: str
    price: float
    url: str
    image_url: Optional[str]
    source: str
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


class AppConfigRead(BaseModel):
    wa_provider: str
    wa_base_url: Optional[str]
    wa_instance: Optional[str]
    global_interval: int
    send_start_hour: int
    send_end_hour: int
    ml_client_id: Optional[str]

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


class PriceHistoryRead(BaseModel):
    id: int
    product_id: int
    price: float
    recorded_at: datetime

    class Config:
        from_attributes = True


class CreateWAGroupRequest(BaseModel):
    participants: list[str] = []
