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

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
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
