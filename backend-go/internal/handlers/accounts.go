package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"time"
)

type QRProvider interface {
	GetQRCode(ctx context.Context) (string, error)
}

type AccountsHandler struct {
	store store.Store
}

func NewAccounts(st store.Store) *AccountsHandler {
	return &AccountsHandler{store: st}
}

func (h *AccountsHandler) ListWA(w http.ResponseWriter, r *http.Request) {
	accs, err := h.store.ListWAAccounts()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if accs == nil {
		accs = []models.WAAccount{}
	}
	writeJSON(w, http.StatusOK, accs)
}

func (h *AccountsHandler) GetWA(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	a, err := h.store.GetWAAccount(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

type waAccountRequest struct {
	Name        string `json:"name"`
	Provider    string `json:"provider"`
	BaseURL     string `json:"base_url"`
	APIKey      string `json:"api_key"`
	Instance    string `json:"instance"`
	GroupPrefix string `json:"group_prefix"`
	Active      bool   `json:"active"`
}

func (h *AccountsHandler) CreateWA(w http.ResponseWriter, r *http.Request) {
	var req waAccountRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a := waAccountFromReq(req)
	id, err := h.store.CreateWAAccount(a)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.ID = id
	writeJSON(w, http.StatusCreated, a)
}

func (h *AccountsHandler) UpdateWA(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req waAccountRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a := waAccountFromReq(req)
	a.ID = id
	if err := h.store.UpdateWAAccount(a); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (h *AccountsHandler) DeleteWA(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteWAAccount(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AccountsHandler) WAStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	acc, err := h.store.GetWAAccount(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "account not found")
		return
	}
	if !acc.BaseURL.Valid || !acc.APIKey.Valid || !acc.Instance.Valid {
		writeJSON(w, http.StatusOK, map[string]string{"status": "STOPPED"})
		return
	}
	evo := newEvolutionClient(acc.BaseURL.String, acc.APIKey.String, acc.Instance.String)
	status, err := evo.getStatus(r.Context())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "STOPPED", "error": err.Error()})
		return
	}
	// Mapeia estados da Evolution para o formato do frontend
	mapped := map[string]string{
		"open":          "WORKING",
		"close":         "STOPPED",
		"connecting":    "SCAN_QR_CODE",
		"qrcode":        "SCAN_QR_CODE",
		"SCAN_QR_CODE":  "SCAN_QR_CODE",
		"disconnected":  "STOPPED",
		"disconnecting": "STOPPED",
	}
	if s, ok := mapped[status]; ok {
		status = s
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": status})
}

// WAStartSession cria/inicializa a instância na Evolution API e aguarda QR.
func (h *AccountsHandler) WAStartSession(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	acc, err := h.store.GetWAAccount(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "account not found")
		return
	}

	// Se a conta não tem URL própria, usa o AppConfig global
	baseURL, apiKey, instance := acc.BaseURL.String, acc.APIKey.String, acc.Instance.String
	if !acc.BaseURL.Valid || baseURL == "" {
		cfg, _ := h.store.GetConfig()
		if cfg.WABaseURL.Valid {
			baseURL = cfg.WABaseURL.String
		}
		if cfg.WAApiKey.Valid && apiKey == "" {
			apiKey = cfg.WAApiKey.String
		}
		if cfg.WAInstance.Valid && instance == "" {
			instance = cfg.WAInstance.String
		}
	}

	if baseURL == "" {
		writeErr(w, http.StatusUnprocessableEntity, "Evolution URL não configurada")
		return
	}

	evo := newEvolutionClient(baseURL, apiKey, instance)
	if err := evo.createInstance(r.Context()); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "STARTING"})
}

func (h *AccountsHandler) WAQR(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	acc, err := h.store.GetWAAccount(id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	baseURL, apiKey, instance := acc.BaseURL.String, acc.APIKey.String, acc.Instance.String
	if !acc.BaseURL.Valid || baseURL == "" {
		cfg, _ := h.store.GetConfig()
		if cfg.WABaseURL.Valid {
			baseURL = cfg.WABaseURL.String
		}
		if cfg.WAApiKey.Valid {
			apiKey = cfg.WAApiKey.String
		}
		if cfg.WAInstance.Valid {
			instance = cfg.WAInstance.String
		}
	}

	if baseURL == "" {
		http.Error(w, "not configured", http.StatusUnprocessableEntity)
		return
	}

	evo := newEvolutionClient(baseURL, apiKey, instance)
	qrJSON, err := evo.getQRCode(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	// Extrai base64 do JSON e retorna HTML com <img>
	var qrBody map[string]any
	_ = json.Unmarshal([]byte(qrJSON), &qrBody)
	base64QR, _ := qrBody["base64"].(string)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// O QR expira a cada ~25s na Evolution — recarrega o iframe automaticamente
	refreshURL := r.URL.Path
	if base64QR != "" {
		fmt.Fprintf(w, `<!DOCTYPE html><html><head>
<script>setTimeout(()=>location.reload(),20000)</script>
</head><body style="margin:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:8px">
<img src="%s" style="max-width:90%%;max-height:90%%;object-fit:contain"/>
<p style="color:#666;font-size:11px;font-family:sans-serif">Atualiza automaticamente a cada 20s</p>
</body></html>`, base64QR)
	} else {
		fmt.Fprintf(w, `<!DOCTYPE html><html><head>
<script>setTimeout(()=>location.reload(),5000)</script>
</head><body style="margin:0;background:#111;color:#888;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;gap:8px">
<p>Aguardando QR code...</p>
<p style="font-size:11px">(<a href="%s" style="color:#555">atualizar agora</a>)</p>
</body></html>`, refreshURL)
	}
}

// WAHealth verifica se a Evolution API está acessível — retorna {online, url, version?, error?}.
func (h *AccountsHandler) WAHealth(w http.ResponseWriter, r *http.Request) {
	// Tenta pegar URL da primeira conta WA ativa, depois do AppConfig
	var baseURL string
	accs, _ := h.store.ListWAAccounts()
	for _, a := range accs {
		if a.Active && a.BaseURL.Valid && a.BaseURL.String != "" {
			baseURL = a.BaseURL.String
			break
		}
	}
	if baseURL == "" {
		cfg, err := h.store.GetConfig()
		if err == nil && cfg.WABaseURL.Valid {
			baseURL = cfg.WABaseURL.String
		}
	}
	if baseURL == "" {
		writeJSON(w, http.StatusOK, map[string]any{"online": false, "error": "Nenhuma URL configurada"})
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), "GET", strings.TrimRight(baseURL, "/")+"/", nil)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"online": false, "url": baseURL, "error": err.Error()})
		return
	}
	resp, err := client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"online": false, "url": baseURL, "error": err.Error()[:100]})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode == 200 {
		var body map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&body)
		version, _ := body["version"].(string)
		writeJSON(w, http.StatusOK, map[string]any{"online": true, "url": baseURL, "version": version})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"online": false, "url": baseURL, "status": resp.StatusCode})
}

func (h *AccountsHandler) ListTG(w http.ResponseWriter, r *http.Request) {
	accs, err := h.store.ListTGAccounts()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if accs == nil {
		accs = []models.TGAccount{}
	}
	writeJSON(w, http.StatusOK, accs)
}

type tgAccountRequest struct {
	Name        string `json:"name"`
	BotToken    string `json:"bot_token"`
	BotUsername string `json:"bot_username"`
	GroupPrefix string `json:"group_prefix"`
	Active      bool   `json:"active"`
}

func (h *AccountsHandler) CreateTG(w http.ResponseWriter, r *http.Request) {
	var req tgAccountRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a := tgAccountFromReq(req)
	id, err := h.store.CreateTGAccount(a)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.ID = id
	writeJSON(w, http.StatusCreated, a)
}

func (h *AccountsHandler) UpdateTG(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req tgAccountRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a := tgAccountFromReq(req)
	a.ID = id
	if err := h.store.UpdateTGAccount(a); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (h *AccountsHandler) DeleteTG(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteTGAccount(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AccountsHandler) ListTGChats(w http.ResponseWriter, r *http.Request) {
	chats, err := h.store.ListTelegramChats()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if chats == nil {
		chats = []models.TelegramChat{}
	}
	writeJSON(w, http.StatusOK, chats)
}

func (h *AccountsHandler) ListGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := h.store.ListGroups()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if groups == nil {
		groups = []models.Group{}
	}
	writeJSON(w, http.StatusOK, groups)
}

// ---------------------------------------------------------------------------
// Mini Evolution client para status (evita dependência circular com adapters)
// ---------------------------------------------------------------------------

type evoClient struct{ baseURL, apiKey, instance string }

func newEvolutionClient(baseURL, apiKey, instance string) *evoClient {
	return &evoClient{baseURL: baseURL, apiKey: apiKey, instance: instance}
}

func (e *evoClient) getStatus(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET",
		e.baseURL+"/instance/connectionState/"+e.instance, nil)
	if err != nil {
		return "error", err
	}
	req.Header.Set("apiKey", e.apiKey)
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "disconnected", err
	}
	defer resp.Body.Close()
	var body struct {
		Instance struct {
			State string `json:"state"`
		} `json:"instance"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "error", err
	}
	switch body.Instance.State {
	case "open":
		return "connected", nil
	case "close":
		return "disconnected", nil
	default:
		return body.Instance.State, nil
	}
}

func (e *evoClient) getQRCode(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET",
		e.baseURL+"/instance/connect/"+e.instance, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("apiKey", e.apiKey)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return string(body), nil
}

func (e *evoClient) createInstance(ctx context.Context) error {
	body := map[string]any{
		"instanceName": e.instance,
		"integration":  "WHATSAPP-BAILEYS",
	}
	b, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST",
		e.baseURL+"/instance/create", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apiKey", e.apiKey)
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	// 409 = já existe — ok
	if resp.StatusCode >= 400 && resp.StatusCode != 409 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("evolution create: status %d — %s", resp.StatusCode, string(b))
	}
	return nil
}

func waAccountFromReq(req waAccountRequest) models.WAAccount {
	a := models.WAAccount{
		Name:     req.Name,
		Provider: req.Provider,
		Status:   "disconnected",
		Active:   req.Active,
	}
	if a.Provider == "" {
		a.Provider = "evolution"
	}
	if req.BaseURL != "" {
		a.BaseURL = models.NullString{NullString: sql.NullString{String: req.BaseURL, Valid: true}}
	}
	if req.APIKey != "" {
		a.APIKey = models.NullString{NullString: sql.NullString{String: req.APIKey, Valid: true}}
	}
	if req.Instance != "" {
		a.Instance = models.NullString{NullString: sql.NullString{String: req.Instance, Valid: true}}
	}
	if req.GroupPrefix != "" {
		a.GroupPrefix = models.NullString{NullString: sql.NullString{String: req.GroupPrefix, Valid: true}}
	}
	return a
}

func tgAccountFromReq(req tgAccountRequest) models.TGAccount {
	a := models.TGAccount{
		Name:   req.Name,
		Active: req.Active,
	}
	if req.BotToken != "" {
		a.BotToken = models.NullString{NullString: sql.NullString{String: req.BotToken, Valid: true}}
	}
	if req.BotUsername != "" {
		a.BotUsername = models.NullString{NullString: sql.NullString{String: req.BotUsername, Valid: true}}
	}
	if req.GroupPrefix != "" {
		a.GroupPrefix = models.NullString{NullString: sql.NullString{String: req.GroupPrefix, Valid: true}}
	}
	return a
}
