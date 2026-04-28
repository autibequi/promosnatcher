package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
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
		writeJSON(w, http.StatusOK, map[string]string{"status": "disconnected", "state": "unconfigured"})
		return
	}
	evo := newEvolutionClient(acc.BaseURL.String, acc.APIKey.String, acc.Instance.String)
	status, err := evo.getStatus(r.Context())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": status})
}

func (h *AccountsHandler) WAQR(w http.ResponseWriter, r *http.Request) {
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
		writeErr(w, http.StatusUnprocessableEntity, "account not configured")
		return
	}
	evo := newEvolutionClient(acc.BaseURL.String, acc.APIKey.String, acc.Instance.String)
	qr, err := evo.getQRCode(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(qr))
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
