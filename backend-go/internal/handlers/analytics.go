package handlers

import (
	"net/http"
	"snatcher/backendv2/internal/store"
	"strconv"
	"time"
)

type AnalyticsHandler struct {
	store store.Store
}

func NewAnalytics(st store.Store) *AnalyticsHandler {
	return &AnalyticsHandler{store: st}
}

func (h *AnalyticsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days <= 0 || days > 365 {
		days = 30
	}
	since := time.Now().UTC().AddDate(0, 0, -days)

	summary, err := h.store.GetAnalyticsSummary(since, days)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, summary)
}
