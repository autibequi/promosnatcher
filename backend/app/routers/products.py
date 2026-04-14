from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from ..database import get_session
from ..models import Product, Group, AppConfig, PriceHistory
from ..schemas import ProductRead, ProductsPage, PriceHistoryRead
from ..services.whatsapp.factory import get_adapter
from ..services.scanner import _format_message, _parse_group_ids

router = APIRouter(tags=["products"])


@router.get("/groups/{group_id}/products", response_model=ProductsPage)
def list_products(
    group_id: int,
    source: str | None = Query(None),
    sent: bool | None = Query(None),
    limit: int = Query(30, le=100),
    offset: int = Query(0),
    session: Session = Depends(get_session),
):
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(404, "Group not found")

    # Filtros base (sem paginação — usados tanto para count quanto para items)
    def _apply_filters(q):
        q = q.where(Product.group_id == group_id)
        if source:
            q = q.where(Product.source == source)
        if sent is True:
            q = q.where(Product.sent_at.is_not(None))
        elif sent is False:
            q = q.where(Product.sent_at.is_(None))
        return q

    total = session.scalar(_apply_filters(select(func.count(Product.id)))) or 0
    items = session.exec(
        _apply_filters(select(Product)).order_by(Product.found_at.desc()).offset(offset).limit(limit)
    ).all()

    return ProductsPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/products/{product_id}/history", response_model=list[PriceHistoryRead])
def get_product_history(product_id: int, session: Session = Depends(get_session)):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    q = (
        select(PriceHistory)
        .where(PriceHistory.product_id == product_id)
        .order_by(PriceHistory.recorded_at.asc())
    )
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
    wa_group_ids = _parse_group_ids(group.whatsapp_group_id if group else None)
    if not group or not wa_group_ids:
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
        "image_url": product.image_url,
        "short_id": product.short_id,
    }
    msg = _format_message(item, group.name, group.message_template, config=config)

    sent = False
    img = product.image_url
    for gid in wa_group_ids:
        if img:
            ok = await adapter.send_image(gid, img, msg)
            if not ok:
                ok = await adapter.send_text(gid, msg)
        else:
            ok = await adapter.send_text(gid, msg)
        if ok:
            sent = True

    if not sent:
        raise HTTPException(422, "Falha ao enviar mensagem — verifique se o WhatsApp está conectado e o grupo WA vinculado")

    product.sent_at = datetime.utcnow()
    session.add(product)
    session.commit()
    return {"message": f"Enviado para {len(wa_group_ids)} grupo(s)"}
