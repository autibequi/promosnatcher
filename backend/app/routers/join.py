import html
import json
import logging
import os
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session, select

from ..database import get_session
from ..models import Channel, ChannelTarget

logger = logging.getLogger(__name__)

router = APIRouter(tags=["join"])

_GA_ID = os.getenv("GA_MEASUREMENT_ID", "")

# Redirect direto — 1 target
_REDIRECT_HTML = """<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta property="og:title" content="{og_title}">
<meta property="og:description" content="{og_description}">
<meta property="og:type" content="website">
{ga_script}
<noscript><meta http-equiv="refresh" content="0;url={invite_url}"></noscript>
<script>
{ga_event}
setTimeout(function(){{window.location.replace('{invite_url}')}},150);
</script>
</head><body></body></html>"""

# Picker — múltiplos targets
_PICKER_HTML = """<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:title" content="{og_title}">
<meta property="og:description" content="{og_description}">
<meta property="og:type" content="website">
<title>{channel_name}</title>
{ga_script}
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#0f0f0f;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px}}
.card{{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:20px;padding:32px 24px;
  max-width:520px;width:100%;text-align:center}}
.icon{{font-size:40px;margin-bottom:12px}}
h1{{font-size:1.25rem;font-weight:700;margin-bottom:6px;color:#fff}}
.desc{{font-size:.875rem;color:#888;margin-bottom:28px;line-height:1.5}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}}
a.btn{{display:flex;align-items:center;gap:10px;padding:13px 16px;border-radius:12px;
  text-decoration:none;font-weight:600;font-size:.875rem;transition:filter .15s;text-align:left}}
a.btn:hover{{filter:brightness(1.12)}}
a.btn.wa{{background:#128c4a;color:#fff}}
a.btn.tg{{background:#1a7bb5;color:#fff}}
.btn-icon{{font-size:1.2rem;flex-shrink:0}}
.btn-body{{min-width:0}}
.btn-name{{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.btn-sub{{display:block;font-size:.72rem;opacity:.65;font-weight:400;margin-top:1px}}
.count{{font-size:.75rem;color:#555;margin-top:20px}}
</style>
</head><body>
<div class="card">
  <div class="icon">🔥</div>
  <h1>{channel_name}</h1>
  <p class="desc">{channel_description}</p>
  <div class="grid">
    {buttons}
  </div>
  <p class="count">{count} grupo{plural} disponíve{plural2}</p>
</div>
{ga_click_script}
</body></html>"""

_WA_BTN = """<a class="btn wa" href="{url}" onclick="ga_click('whatsapp','{label_esc}')">
  <span class="btn-icon">📱</span>
  <span class="btn-body"><span class="btn-name">{label}</span><span class="btn-sub">WhatsApp</span></span>
</a>"""

_TG_BTN = """<a class="btn tg" href="{url}" onclick="ga_click('telegram','{label_esc}')">
  <span class="btn-icon">✈️</span>
  <span class="btn-body"><span class="btn-name">{label}</span><span class="btn-sub">Telegram</span></span>
</a>"""

_GA_SCRIPT = """<script async src="https://www.googletagmanager.com/gtag/js?id={ga_id}"></script>
<script>
window.dataLayer=window.dataLayer||[];
function gtag(){{dataLayer.push(arguments)}}
gtag('js',new Date());
gtag('config','{ga_id}',{{send_page_view:false}});
</script>"""

_GA_EVENT_REDIRECT = """gtag('event','group_join',{{channel_slug:'{slug}',channel_name:'{name}',provider:'{provider}'}});"""

_GA_CLICK_SCRIPT = """<script>
function ga_click(provider, label) {{
  if (typeof gtag === 'undefined') return;
  gtag('event', 'group_join', {{channel_slug: '{slug}', channel_name: '{name}', provider: provider, group_label: label}});
}}
</script>"""


def _e(s: str) -> str:
    return html.escape(str(s), quote=True)


def _targets_with_invite(targets: list[ChannelTarget]) -> list[ChannelTarget]:
    return [t for t in targets if t.invite_url and t.status == "ok"]


@router.get("/join/{slug}")
def join_group(slug: str, request: Request, session: Session = Depends(get_session)):
    channel = session.exec(
        select(Channel).where(Channel.slug == slug, Channel.active == True)
    ).first()

    if not channel:
        logger.info("join.not_found slug=%s", slug)
        return RedirectResponse("/", status_code=302)

    all_targets = session.exec(
        select(ChannelTarget).where(ChannelTarget.channel_id == channel.id)
    ).all()

    active = _targets_with_invite(list(all_targets))

    if not active:
        logger.warning("join.no_invite slug=%s", slug)
        return RedirectResponse("/", status_code=302)

    ga_id = _GA_ID
    og_title = _e(f"Entrar no grupo {channel.name}")
    og_desc = _e(channel.description or f"Grupos de promoções — {channel.name}")

    # --- 1 target: redirect imediato ---
    if len(active) == 1:
        t = active[0]
        ga_script = _GA_SCRIPT.format(ga_id=_e(ga_id), **{"ga_id": _e(ga_id)}) if ga_id else ""
        ga_event = _GA_EVENT_REDIRECT.format(
            slug=_e(slug), name=_e(channel.name), provider=_e(t.provider)
        ) if ga_id else ""
        page = _REDIRECT_HTML.format(
            og_title=og_title,
            og_description=og_desc,
            ga_script=ga_script,
            ga_event=ga_event,
            invite_url=_e(t.invite_url),
        )
        logger.info("join.redirect slug=%s provider=%s", slug, t.provider)
        return HTMLResponse(page)

    # --- N targets: picker ---
    buttons = []
    # Contadores para fallback de label quando não tem name
    wa_idx, tg_idx = 1, 1
    for t in active:
        if t.name:
            display = t.name
        elif t.provider == "whatsapp":
            display = f"Grupo WhatsApp {wa_idx}" if wa_idx > 1 or len([x for x in active if x.provider == "whatsapp"]) > 1 else "Grupo WhatsApp"
            wa_idx += 1
        else:
            display = f"Canal Telegram {tg_idx}" if tg_idx > 1 or len([x for x in active if x.provider == "telegram"]) > 1 else "Canal Telegram"
            tg_idx += 1

        tmpl = _WA_BTN if t.provider == "whatsapp" else _TG_BTN
        buttons.append(tmpl.format(url=_e(t.invite_url), label=_e(display), label_esc=_e(display)))

    n = len(active)
    ga_script = _GA_SCRIPT.format(ga_id=_e(ga_id)) if ga_id else ""
    ga_click = _GA_CLICK_SCRIPT.format(slug=_e(slug), name=_e(channel.name)) if ga_id else "<script>function ga_click(){}</script>"

    page = _PICKER_HTML.format(
        og_title=og_title,
        og_description=og_desc,
        channel_name=_e(channel.name),
        channel_description=_e(channel.description or "Escolha onde receber as promoções"),
        buttons="\n    ".join(buttons),
        ga_script=ga_script,
        ga_click_script=ga_click,
        count=n,
        plural="s" if n != 1 else "",
        plural2="is" if n != 1 else "l",
    )
    logger.info("join.picker slug=%s targets=%d", slug, len(active))
    return HTMLResponse(page)
