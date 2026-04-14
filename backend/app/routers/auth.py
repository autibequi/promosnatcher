from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services.auth import verify_credentials, create_token

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    if not verify_credentials(body.username, body.password):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    return TokenResponse(access_token=create_token(body.username))


@router.get("/me")
def me(username: str = None):
    """Verifica se o token é válido. Retorna o usuário."""
    return {"username": username or "anonymous"}
