import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.getenv("AUTH_SECRET", "promo-snatcher-secret-change-me")
ALGORITHM = "HS256"
EXPIRE_HOURS = int(os.getenv("AUTH_TOKEN_HOURS", "72"))

_bearer = HTTPBearer(auto_error=False)


def verify_credentials(username: str, password: str) -> bool:
    expected_user = os.getenv("AUTH_USERNAME", "admin")
    expected_pass = os.getenv("AUTH_PASSWORD", "")
    if not expected_pass:
        return False  # sem senha configurada = auth desabilitado para este método
    return username == expected_user and password == expected_pass


def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.utcnow() + timedelta(hours=EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def require_auth(credentials: HTTPAuthorizationCredentials = Security(_bearer)):
    """Dependency: valida JWT. Levanta 401 se inválido ou ausente."""
    auth_password = os.getenv("AUTH_PASSWORD", "")
    if not auth_password:
        return "anonymous"  # auth desabilitado

    if not credentials:
        raise HTTPException(status_code=401, detail="Token não fornecido")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload["sub"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
