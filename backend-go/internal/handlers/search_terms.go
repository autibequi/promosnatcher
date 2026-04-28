package handlers

import (
	"net/http"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type SearchTermsHandler struct {
	store store.Store
}

func NewSearchTerms(st store.Store) *SearchTermsHandler {
	return &SearchTermsHandler{store: st}
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
	var t models.SearchTerm
	if err := decodeBody(r, &t); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if t.Queries == "" {
		t.Queries = "[]"
	}
	if t.Sources == "" {
		t.Sources = "all"
	}
	if t.CrawlInterval == 0 {
		t.CrawlInterval = 30
	}
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
	var t models.SearchTerm
	if err := decodeBody(r, &t); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	t.ID = id
	if err := h.store.UpdateSearchTerm(t); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, t)
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
