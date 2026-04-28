"""CRUD Catálogo + Keywords + variantes."""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from ..database import get_session
from ..models import CatalogProduct, CatalogVariant, PriceHistoryV2, GroupingKeyword
from ..schemas import (
    CatalogProductRead, CatalogProductDetail, CatalogProductsPage, CatalogProductUpdate,
    CatalogVariantRead, GroupingKeywordCreate, GroupingKeywordRead,
    PriceHistoryRead,
)

router = APIRouter(prefix="/catalog", tags=["catalog"])


# --- CatalogProduct ---

@router.get("", response_model=CatalogProductsPage)
def list_products(
    tag: str | None = Query(None),
    brand: str | None = Query(None),
    source: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(30, le=100),
    offset: int = Query(0),
    session: Session = Depends(get_session),
):
    """Lista CatalogProducts com filtros."""
    def _apply(q):
        if tag:
            q = q.where(CatalogProduct.tags.contains(f'"{tag}"'))
        if brand:
            q = q.where(CatalogProduct.brand.ilike(f"%{brand}%"))
        if source:
            q = q.where(CatalogProduct.lowest_price_source == source)
        if search:
            q = q.where(CatalogProduct.canonical_name.ilike(f"%{search}%"))
        return q

    total = session.scalar(_apply(select(func.count(CatalogProduct.id)))) or 0
    products = session.exec(
        _apply(select(CatalogProduct))
        .order_by(CatalogProduct.updated_at.desc())
        .offset(offset).limit(limit)
    ).all()

    # Adicionar variant_count
    items = []
    for p in products:
        count = session.scalar(
            select(func.count(CatalogVariant.id))
            .where(CatalogVariant.catalog_product_id == p.id)
        ) or 0
        data = p.model_dump()
        data["variant_count"] = count
        items.append(data)

    return CatalogProductsPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/{product_id}", response_model=CatalogProductDetail)
def get_product(product_id: int, session: Session = Depends(get_session)):
    product = session.get(CatalogProduct, product_id)
    if not product:
        raise HTTPException(404, "CatalogProduct not found")
    variants = session.exec(
        select(CatalogVariant)
        .where(CatalogVariant.catalog_product_id == product_id)
        .order_by(CatalogVariant.price.asc())
    ).all()
    data = product.model_dump()
    data["variants"] = [v.model_dump() for v in variants]
    data["variant_count"] = len(variants)
    return data


@router.put("/{product_id}", response_model=CatalogProductRead)
def update_product(product_id: int, data: CatalogProductUpdate, session: Session = Depends(get_session)):
    product = session.get(CatalogProduct, product_id)
    if not product:
        raise HTTPException(404, "CatalogProduct not found")
    if data.brand is not None:
        product.brand = data.brand
    if data.tags is not None:
        # Validar JSON
        try:
            json.loads(data.tags)
        except Exception:
            raise HTTPException(400, "tags deve ser JSON array válido")
        product.tags = data.tags
    session.add(product)
    session.commit()
    session.refresh(product)
    count = session.scalar(
        select(func.count(CatalogVariant.id))
        .where(CatalogVariant.catalog_product_id == product.id)
    ) or 0
    result = product.model_dump()
    result["variant_count"] = count
    return result


@router.get("/{product_id}/variants", response_model=list[CatalogVariantRead])
def list_variants(product_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(CatalogVariant)
        .where(CatalogVariant.catalog_product_id == product_id)
        .order_by(CatalogVariant.price.asc())
    ).all()


@router.get("/variants/{variant_id}/history")
def variant_history(variant_id: int, session: Session = Depends(get_session)):
    variant = session.get(CatalogVariant, variant_id)
    if not variant:
        raise HTTPException(404, "Variant not found")
    history = session.exec(
        select(PriceHistoryV2)
        .where(PriceHistoryV2.variant_id == variant_id)
        .order_by(PriceHistoryV2.recorded_at.asc())
    ).all()
    return [{"id": h.id, "price": h.price, "recorded_at": h.recorded_at} for h in history]


# --- GroupingKeyword ---

@router.get("/keywords", response_model=list[GroupingKeywordRead])
def list_keywords(session: Session = Depends(get_session)):
    return session.exec(select(GroupingKeyword)).all()


@router.post("/keywords", response_model=GroupingKeywordRead, status_code=201)
def create_keyword(data: GroupingKeywordCreate, session: Session = Depends(get_session)):
    existing = session.exec(
        select(GroupingKeyword).where(GroupingKeyword.keyword == data.keyword)
    ).first()
    if existing:
        raise HTTPException(409, f"Keyword '{data.keyword}' já existe")
    kw = GroupingKeyword(**data.model_dump())
    session.add(kw)
    session.commit()
    session.refresh(kw)
    return kw


@router.delete("/keywords/{kw_id}", status_code=204)
def delete_keyword(kw_id: int, session: Session = Depends(get_session)):
    kw = session.get(GroupingKeyword, kw_id)
    if not kw:
        raise HTTPException(404, "Keyword not found")
    session.delete(kw)
    session.commit()
