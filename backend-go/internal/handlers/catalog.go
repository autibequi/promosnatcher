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

// List retorna produtos do catálogo com paginação.
//
//	@Summary      Listar catálogo
//	@Description  Retorna lista paginada de produtos do catálogo.
//	@Tags         catalog
//	@Produce      json
//	@Param        limit   query     int  false  "Número máximo de itens (default 30)"
//	@Param        offset  query     int  false  "Offset para paginação"
//	@Success      200     {object}  object{items=[]models.CatalogProduct,total=int,limit=int,offset=int}
//	@Failure      500     {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/catalog [get]
func (h *CatalogHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	if limit == 0 {
		limit = 30
	}

	products, err := h.store.ListCatalogProducts(limit, offset)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if products == nil {
		products = []models.CatalogProduct{}
	}

	total, _ := h.store.CountCatalogProducts()
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  products,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// Get retorna um produto do catálogo pelo ID.
//
//	@Summary      Obter produto
//	@Description  Retorna um produto com suas variantes pelo ID.
//	@Tags         catalog
//	@Produce      json
//	@Param        id   path      int  true  "ID do produto"
//	@Success      200  {object}  object{product=models.CatalogProduct,variants=[]models.CatalogVariant}
//	@Failure      400  {object}  object{error=string}
//	@Failure      404  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/catalog/{id} [get]
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
	if variants == nil {
		variants = []models.CatalogVariant{}
	}
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
	if hist == nil {
		hist = []models.PriceHistoryV2{}
	}
	writeJSON(w, http.StatusOK, hist)
}

func (h *CatalogHandler) ListKeywords(w http.ResponseWriter, r *http.Request) {
	kws, err := h.store.ListGroupingKeywords()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if kws == nil {
		kws = []models.GroupingKeyword{}
	}
	writeJSON(w, http.StatusOK, kws)
}

// VariantStats retorna estatísticas de preço (percentis, média, score) para uma variante.
//
//	@Summary      Estatísticas de preço da variante
//	@Description  Retorna percentis (p25, p50, p75), média, preço atual e score de um variante em uma janela de tempo.
//	@Tags         catalog
//	@Produce      json
//	@Param        id       path      int     true  "ID da variante"
//	@Param        window   query     string  false "Janela de tempo (7d, 30d, 60d, 90d; default 90d)"
//	@Success      200      {object}  models.VariantStats
//	@Failure      400      {object}  object{error=string}
//	@Failure      404      {object}  object{error=string}
//	@Failure      500      {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/catalog/variants/{id}/stats [get]
func (h *CatalogHandler) VariantStats(w http.ResponseWriter, r *http.Request) {
	variantID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid variant id")
		return
	}

	// Parse window parameter
	window := r.URL.Query().Get("window")
	if window == "" {
		window = "90d"
	}

	// Validate window
	windowDays := 0
	switch window {
	case "7d":
		windowDays = 7
	case "30d":
		windowDays = 30
	case "60d":
		windowDays = 60
	case "90d":
		windowDays = 90
	default:
		writeErr(w, http.StatusBadRequest, "invalid window; supported: 7d, 30d, 60d, 90d")
		return
	}

	// Verify variant exists
	variant, err := h.store.GetCatalogVariant(variantID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "variant not found")
		return
	}
	_ = variant // silence unused warning

	stats, err := h.store.GetVariantStats(variantID, windowDays)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	if stats == nil {
		// No price history for this variant
		writeJSON(w, http.StatusOK, map[string]any{
			"error":  "no_price_history",
			"window": window,
		})
		return
	}

	// Set cache header: 10 minutes
	w.Header().Set("Cache-Control", "public, max-age=600")
	writeJSON(w, http.StatusOK, stats)
}
