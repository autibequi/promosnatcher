package handlers

import (
	"database/sql"
	"net/http"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type ChannelsHandler struct {
	store store.Store
}

func NewChannels(st store.Store) *ChannelsHandler {
	return &ChannelsHandler{store: st}
}

func (h *ChannelsHandler) List(w http.ResponseWriter, r *http.Request) {
	channels, err := h.store.ListChannels()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	type channelView struct {
		models.Channel
		Targets []models.ChannelTarget `json:"targets"`
		Rules   []models.ChannelRule   `json:"rules"`
	}

	out := make([]channelView, 0, len(channels))
	for _, c := range channels {
		targets, _ := h.store.ListChannelTargets(c.ID)
		rules, _ := h.store.ListChannelRules(c.ID)
		out = append(out, channelView{Channel: c, Targets: targets, Rules: rules})
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *ChannelsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	c, err := h.store.GetChannel(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	targets, _ := h.store.ListChannelTargets(id)
	rules, _ := h.store.ListChannelRules(id)
	writeJSON(w, http.StatusOK, map[string]any{"channel": c, "targets": targets, "rules": rules})
}

type channelRequest struct {
	Name            string  `json:"name"`
	Description     string  `json:"description"`
	Slug            *string `json:"slug"`
	MessageTemplate *string `json:"message_template"`
	SendStartHour   int     `json:"send_start_hour"`
	SendEndHour     int     `json:"send_end_hour"`
	DigestMode      bool    `json:"digest_mode"`
	DigestMaxItems  int     `json:"digest_max_items"`
	Active          bool    `json:"active"`
}

func (req channelRequest) toModel() models.Channel {
	c := models.Channel{
		Name:           req.Name,
		Description:    req.Description,
		SendStartHour:  req.SendStartHour,
		SendEndHour:    req.SendEndHour,
		DigestMode:     req.DigestMode,
		DigestMaxItems: req.DigestMaxItems,
		Active:         req.Active,
	}
	if req.Slug != nil {
		c.Slug = models.NullString{NullString: sql.NullString{String: *req.Slug, Valid: true}}
	}
	if req.MessageTemplate != nil {
		c.MessageTemplate = models.NullString{NullString: sql.NullString{String: *req.MessageTemplate, Valid: true}}
	}
	if c.SendStartHour == 0 && c.SendEndHour == 0 {
		c.SendStartHour = 8
		c.SendEndHour = 22
	}
	if c.DigestMaxItems == 0 {
		c.DigestMaxItems = 5
	}
	return c
}

func (h *ChannelsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req channelRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		writeErr(w, http.StatusBadRequest, "name is required")
		return
	}
	c := req.toModel()
	if c.Slug.Valid {
		if err := store.ValidSlug(c.Slug.String); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	id, err := h.store.CreateChannel(c)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	c.ID = id
	writeJSON(w, http.StatusCreated, c)
}

func (h *ChannelsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req channelRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	c := req.toModel()
	c.ID = id
	if c.Slug.Valid {
		if err := store.ValidSlug(c.Slug.String); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if err := h.store.UpdateChannel(c); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (h *ChannelsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteChannel(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type targetRequest struct {
	Provider  string  `json:"provider"`
	ChatID    string  `json:"chat_id"`
	Name      *string `json:"name"`
	InviteURL *string `json:"invite_url"`
	Status    string  `json:"status"`
}

func (h *ChannelsHandler) CreateTarget(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req targetRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	t := models.ChannelTarget{
		ChannelID: channelID,
		Provider:  req.Provider,
		ChatID:    req.ChatID,
		Status:    req.Status,
	}
	if t.Status == "" {
		t.Status = "ok"
	}
	if req.Name != nil {
		t.Name = models.NullString{NullString: sql.NullString{String: *req.Name, Valid: true}}
	}
	if req.InviteURL != nil {
		t.InviteURL = models.NullString{NullString: sql.NullString{String: *req.InviteURL, Valid: true}}
	}
	tid, err := h.store.CreateChannelTarget(t)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	t.ID = tid
	writeJSON(w, http.StatusCreated, t)
}

func (h *ChannelsHandler) UpdateTarget(w http.ResponseWriter, r *http.Request) {
	_, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid channel id")
		return
	}
	targetID, ok := pathInt(r, "target_id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid target id")
		return
	}
	var req targetRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	t := models.ChannelTarget{
		ID:       targetID,
		Provider: req.Provider,
		ChatID:   req.ChatID,
		Status:   req.Status,
	}
	if req.Name != nil {
		t.Name = models.NullString{NullString: sql.NullString{String: *req.Name, Valid: true}}
	}
	if req.InviteURL != nil {
		t.InviteURL = models.NullString{NullString: sql.NullString{String: *req.InviteURL, Valid: true}}
	}
	if err := h.store.UpdateChannelTarget(t); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *ChannelsHandler) DeleteTarget(w http.ResponseWriter, r *http.Request) {
	targetID, ok := pathInt(r, "target_id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid target id")
		return
	}
	if err := h.store.DeleteChannelTarget(targetID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type ruleRequest struct {
	MatchType     string   `json:"match_type"`
	MatchValue    *string  `json:"match_value"`
	MaxPrice      *float64 `json:"max_price"`
	NotifyNew     bool     `json:"notify_new"`
	NotifyDrop    bool     `json:"notify_drop"`
	NotifyLowest  bool     `json:"notify_lowest"`
	DropThreshold float64  `json:"drop_threshold"`
	Active        bool     `json:"active"`
}

func (h *ChannelsHandler) CreateRule(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req ruleRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	rule := models.ChannelRule{
		ChannelID:     channelID,
		MatchType:     req.MatchType,
		NotifyNew:     req.NotifyNew,
		NotifyDrop:    req.NotifyDrop,
		NotifyLowest:  req.NotifyLowest,
		DropThreshold: req.DropThreshold,
		Active:        req.Active,
	}
	if rule.DropThreshold == 0 {
		rule.DropThreshold = 0.10
	}
	if req.MatchValue != nil {
		rule.MatchValue = models.NullString{NullString: sql.NullString{String: *req.MatchValue, Valid: true}}
	}
	if req.MaxPrice != nil {
		rule.MaxPrice = models.NullFloat64{NullFloat64: sql.NullFloat64{Float64: *req.MaxPrice, Valid: true}}
	}
	rid, err := h.store.CreateChannelRule(rule)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	rule.ID = rid
	writeJSON(w, http.StatusCreated, rule)
}

func (h *ChannelsHandler) DeleteRule(w http.ResponseWriter, r *http.Request) {
	ruleID, ok := pathInt(r, "rule_id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid rule id")
		return
	}
	if err := h.store.DeleteChannelRule(ruleID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
