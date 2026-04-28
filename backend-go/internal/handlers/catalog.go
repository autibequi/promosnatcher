package handlers

import (
	"net/http"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"strconv"
)

type CatalogHandler struct {
	store store.Store
}

func NewCatalog(st store.Store) *CatalogHandler {
	return &CatalogHandler{store: st}
}

func (h *CatalogHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	if limit == 0 {
		limit = 50
	}

	products, err := h.store.ListCatalogProducts(limit, offset)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if products == nil {
		products = []models.CatalogProduct{}
	}
	writeJSON(w, http.StatusOK, products)
}

func (h *CatalogHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := h.store.GetCatalogProduct(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	variants, _ := h.store.ListVariantsByProduct(id)
	writeJSON(w, http.StatusOK, map[string]any{"product": p, "variants": variants})
}

func (h *CatalogHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := h.store.GetCatalogProduct(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if err := decodeBody(r, &p); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	p.ID = id
	if err := h.store.UpdateCatalogProduct(p); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *CatalogHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteCatalogProduct(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *CatalogHandler) ListVariantHistory(w http.ResponseWriter, r *http.Request) {
	variantID, ok := pathInt(r, "variant_id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid variant id")
		return
	}
	hist, err := h.store.ListPriceHistoryV2(variantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, hist)
}

func (h *CatalogHandler) ListKeywords(w http.ResponseWriter, r *http.Request) {
	kws, err := h.store.ListGroupingKeywords()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, kws)
}
