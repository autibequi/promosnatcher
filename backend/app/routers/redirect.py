import hashlib
import html
import logging
import os
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session, select

from ..database import get_session
from ..models import Product, AppConfig, ClickLog
from ..services import mercadolivre, amazon

logger = logging.getLogger(__name__)

router = APIRouter(tags=["redirect"])

_GA_ID = os.getenv("GA_MEASUREMENT_ID", "")

# HTML mínimo: dispara GA via sendBeacon + redireciona em 100ms
# Se GA não configurado, usa 302 puro (zero latência)
_REDIRECT_HTML = """<!DOCTYPE html>
<html><head>
<script async src="https://www.googletagmanager.com/gtag/js?id={ga_id}"></script>
<script>
window.dataLayer=window.dataLayer||[];
function g(){{dataLayer.push(arguments)}}
g('js',new Date());
g('config','{ga_id}',{{send_page_view:false}});
g('event','affiliate_click',{{
  product_id:'{product_id}',
  product_title:'{title}',
  source:'{source}',
  price:'{price}'
}});
setTimeout(function(){{window.location.replace('{url}')}},150);
</script>
<noscript><meta http-equiv="refresh" content="0;url={url}"></noscript>
</head><body></body></html>"""


@router.get("/r/{short_id}")
def redirect_click(
    short_id: str,
    request: Request,
    session: Session = Depends(get_session),
):
    product = session.exec(
        select(Product).where(Product.short_id == short_id)
    ).first()

    if not product:
        return RedirectResponse("/", status_code=302)

    # Log click no nosso DB
    ip_raw = request.headers.get("x-real-ip") or (request.client.host if request.client else "")
    ip_hash = hashlib.sha256(ip_raw.encode()).hexdigest()[:16]
    session.add(ClickLog(
        product_id=product.id,
        ip_hash=ip_hash,
        user_agent=(request.headers.get("user-agent") or "")[:500],
        referrer=(request.headers.get("referer") or "")[:500],
    ))
    session.commit()

    # Gera URL afiliada no momento do clique
    config = session.get(AppConfig, 1)
    url = product.url
    if config:
        if product.source == "amazon" and config.amz_tracking_id:
            url = amazon.make_affiliate_url(url, config.amz_tracking_id)
        elif product.source == "mercadolivre" and config.ml_affiliate_tool_id:
            url = mercadolivre.make_affiliate_url(url, config.ml_affiliate_tool_id)

    logger.info("redirect.click", extra={"product_id": product.id, "source": product.source})

    # Com GA configurado: HTML mínimo que dispara evento + redirect em 150ms
    # Sem GA: 302 puro, zero latência
    ga_id = _GA_ID or os.getenv("GA_MEASUREMENT_ID", "")
    if ga_id:
        page = _REDIRECT_HTML.format(
            ga_id=ga_id,
            url=html.escape(url, quote=True),
            product_id=product.id,
            title=html.escape(product.title[:100], quote=True),
            source=product.source,
            price=f"{product.price:.2f}",
        )
        return HTMLResponse(page)

    return RedirectResponse(url, status_code=302)
