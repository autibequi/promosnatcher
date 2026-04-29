package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/store"
)

// searchTermRequest aceita queries como array (como o frontend envia).
type searchTermRequest struct {
	Query             string   `json:"query"`
	Queries           []string `json:"queries"`
	MinVal            float64  `json:"min_val"`
	MaxVal            float64  `json:"max_val"`
	Sources           string   `json:"sources"`
	Active            *bool    `json:"active"`
	CrawlInterval     int      `json:"crawl_interval"`
	MLAffiliateToolID string   `json:"ml_affiliate_tool_id"`
	AmzTrackingID     string   `json:"amz_tracking_id"`
}

func (req searchTermRequest) toModel() models.SearchTerm {
	queriesJSON, _ := json.Marshal(req.Queries)
	t := models.SearchTerm{
		Query:         req.Query,
		Queries:       string(queriesJSON),
		MinVal:        req.MinVal,
		MaxVal:        req.MaxVal,
		Sources:       req.Sources,
		CrawlInterval: req.CrawlInterval,
	}
	if t.Queries == "" || t.Queries == "null" {
		t.Queries = "[]"
	}
	if t.Sources == "" {
		t.Sources = "all"
	}
	if t.CrawlInterval == 0 {
		t.CrawlInterval = 30
	}
	if req.Active != nil {
		t.Active = *req.Active
	} else {
		t.Active = true
	}
	if req.MLAffiliateToolID != "" {
		t.MLAffiliateToolID = models.NullString{NullString: sqlNullString(req.MLAffiliateToolID)}
	}
	if req.AmzTrackingID != "" {
		t.AmzTrackingID = models.NullString{NullString: sqlNullString(req.AmzTrackingID)}
	}
	return t
}

type SearchTermsHandler struct {
	store   store.Store
	scrapers map[string]pipeline.Scraper
}

func NewSearchTerms(st store.Store, scrapers map[string]pipeline.Scraper) *SearchTermsHandler {
	return &SearchTermsHandler{store: st, scrapers: scrapers}
}

func (h *SearchTermsHandler) List(w http.ResponseWriter, r *http.Request) {
	terms, err := h.store.ListSearchTerms()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if terms == nil {
		terms = []models.SearchTerm{}
	}
	writeJSON(w, http.StatusOK, terms)
}

func (h *SearchTermsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	t, err := h.store.GetSearchTerm(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *SearchTermsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req searchTermRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	t := req.toModel()
	id, err := h.store.CreateSearchTerm(t)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	t.ID = id
	writeJSON(w, http.StatusCreated, t)
}

func (h *SearchTermsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req searchTermRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	t := req.toModel()
	t.ID = id
	if err := h.store.UpdateSearchTerm(t); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *SearchTermsHandler) ListResults(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	_, err := h.store.GetSearchTerm(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	if limit == 0 {
		limit = 30
	}
	results, err := h.store.ListCrawlResultsByTerm(id, limit, offset)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if results == nil {
		results = []models.CrawlResult{}
	}
	total, _ := h.store.CountCrawlResultsByTerm(id)
	writeJSON(w, http.StatusOK, map[string]any{
		"items": results, "total": total, "limit": limit, "offset": offset,
	})
}

func (h *SearchTermsHandler) CrawlNow(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	term, err := h.store.GetSearchTerm(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	// Dispara crawl + process em background
	go func() {
		ctx := context.Background()
		_ = pipeline.CrawlSearchTerm(ctx, h.store, term, h.scrapers)
		_ = pipeline.ProcessCrawlResults(ctx, h.store)
	}()
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "triggered", "search_term_id": id})
}

func (h *SearchTermsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteSearchTerm(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
