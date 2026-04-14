from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..database import get_session
from ..models import Product, Group, AppConfig
from ..schemas import ProductRead
from ..services.whatsapp.factory import get_adapter
from ..services.scanner import _format_message

router = APIRouter(tags=["products"])


@router.get("/groups/{group_id}/products", response_model=list[ProductRead])
def list_products(
    group_id: int,
    source: str | None = Query(None),
    sent: bool | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    session: Session = Depends(get_session),
):
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")

    q = select(Product).where(Product.group_id == group_id)
    if source:
        q = q.where(Product.source == source)
    if sent is True:
        q = q.where(Product.sent_at.is_not(None))
    elif sent is False:
        q = q.where(Product.sent_at.is_(None))
    q = q.order_by(Product.found_at.desc()).offset(offset).limit(limit)
    return session.exec(q).all()


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int, session: Session = Depends(get_session)):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    session.delete(product)
    session.commit()


@router.post("/products/{product_id}/send")
async def send_product(product_id: int, session: Session = Depends(get_session)):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    group = session.get(Group, product.group_id)
    if not group or not group.whatsapp_group_id:
        raise HTTPException(400, "Grupo sem WhatsApp configurado")

    config = session.get(AppConfig, 1)
    if not config:
        raise HTTPException(400, "WhatsApp não configurado")

    adapter = get_adapter(
        config.wa_provider,
        config.wa_base_url or "",
        config.wa_api_key or "",
        config.wa_instance or "",
    )
    if not adapter:
        raise HTTPException(400, "Configuração WhatsApp incompleta")

    item = {
        "title": product.title,
        "price": product.price,
        "url": product.url,
        "source": product.source,
    }
    msg = _format_message(item, group.name)
    ok = await adapter.send_text(group.whatsapp_group_id, msg)
    if not ok:
        raise HTTPException(502, "Falha ao enviar mensagem")

    product.sent_at = datetime.utcnow()
    session.add(product)
    session.commit()
    return {"message": "Enviado com sucesso"}
