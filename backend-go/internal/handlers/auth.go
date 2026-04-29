package handlers

import (
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type AuthHandler struct {
	adminUser string
	adminPass string
	secret    string
}

func NewAuth(adminUser, adminPass, secret string) *AuthHandler {
	return &AuthHandler{adminUser: adminUser, adminPass: adminPass, secret: secret}
}

// Login autentica o admin e retorna um JWT.
//
//	@Summary      Login
//	@Description  Autentica com usuário e senha, retorna access_token JWT.
//	@Tags         auth
//	@Accept       json
//	@Produce      json
//	@Param        body  body      object{username=string,password=string}  true  "Credenciais"
//	@Success      200   {object}  object{access_token=string,token_type=string}
//	@Failure      400   {object}  object{error=string}
//	@Failure      401   {object}  object{error=string}
//	@Router       /api/auth/login [post]
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username" validate:"required"`
		Password string `json:"password" validate:"required,min=4"`
	}
	if err := decodeAndValidate(r, &body); err != nil {
		writeValidationErr(w, err)
		return
	}
	if body.Username != h.adminUser || body.Password != h.adminPass {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	claims := jwt.MapClaims{
		"sub": body.Username,
		"exp": time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(h.secret))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"access_token": signed, "token_type": "bearer"})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"username": h.adminUser})
}
