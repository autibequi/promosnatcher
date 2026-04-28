import os
import re
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import RedirectResponse

_BASE_DOMAIN = os.getenv("BASE_DOMAIN", "snatcher.autibequi.com")
_SLUG_RE = re.compile(r'^([a-z0-9-]+)\.' + re.escape(_BASE_DOMAIN) + r'$')
_PASSTHROUGH = re.compile(r'^/(canal|join|api|r|docs|openapi|public|static|favicon)(/|$)')


class SubdomainRedirectMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        host = request.headers.get("host", "").split(":")[0].lower()
        m = _SLUG_RE.match(host)
        if m and not _PASSTHROUGH.match(request.url.path):
            slug = m.group(1)
            return RedirectResponse(f"/canal/{slug}", status_code=302)
        return await call_next(request)
