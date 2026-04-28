package router

import (
	"encoding/json"
	"net/http"
	"snatcher/backendv2/internal/handlers"
	"snatcher/backendv2/internal/middleware"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/redirect"
	"snatcher/backendv2/internal/scheduler"
	"snatcher/backendv2/internal/store"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
)

func Build(
	st store.Store,
	rd *redirect.Redirector,
	runner *pipeline.Runner,
	sched *scheduler.Scheduler,
	jwtSecret string,
	adminUser, adminPass string,
) http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.CleanPath)   // normaliza // e remove trailing slash
	r.Use(middleware.CORS)

	auth := handlers.NewAuth(adminUser, adminPass, jwtSecret)
	scan := handlers.NewScan(st, runner, sched)
	terms := handlers.NewSearchTerms(st)
	catalog := handlers.NewCatalog(st)
	channels := handlers.NewChannels(st)
	config := handlers.NewConfig(st)
	canal := handlers.NewCanal(st)
	accounts := handlers.NewAccounts(st)
	crawlLogs := handlers.NewCrawlLogs(st)
	broadcast := handlers.NewBroadcast(st)
	analytics := handlers.NewAnalytics(st)

	// ---------------------------------------------------------------------------
	// Rotas públicas
	// ---------------------------------------------------------------------------
	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	r.Post("/api/auth/login", auth.Login)
	r.Get("/api/auth/me", auth.Me)

	r.Get("/r/{shortID}", rd.Handler())

	r.Get("/canal/{slug}", canal.GroupPicker)
	r.Get("/canal/{slug}/preview", canal.Preview)
	r.Get("/join/{slug}", canal.JoinRedirect)

	r.Get("/api/public/channels", func(w http.ResponseWriter, r *http.Request) {
		chs, _ := st.ListChannels()
		type channelSummary struct {
			ID           int64  `json:"id"`
			Name         string `json:"name"`
			Slug         any    `json:"slug"`
			TargetsCount int    `json:"targets_count"`
		}
		var out []channelSummary
		for _, c := range chs {
			if !c.Active {
				continue
			}
			targets, _ := st.ListChannelTargets(c.ID)
			var slug any
			if c.Slug.Valid {
				slug = c.Slug.String
			}
			out = append(out, channelSummary{
				ID: c.ID, Name: c.Name, Slug: slug, TargetsCount: len(targets),
			})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	})

	// QR + health públicos
	r.Get("/api/accounts/wa/{id}/qr", accounts.WAQR)
	r.Get("/api/accounts/wa/health", accounts.WAHealth)

	// ---------------------------------------------------------------------------
	// Rotas protegidas
	// ---------------------------------------------------------------------------
	r.Group(func(r chi.Router) {
		r.Use(middleware.JWTMiddleware(jwtSecret))

		// Scan
		r.Get("/api/scan/status", scan.Status)
		r.Get("/api/scan/jobs", scan.ListJobs)
		r.Post("/api/scan/pipeline", scan.TriggerPipeline)
		r.Post("/api/scan/process", scan.TriggerProcess)

		// Search Terms (com e sem trailing slash)
		r.Get("/api/search-terms", terms.List)
		r.Get("/api/search-terms/", terms.List)
		r.Get("/api/search-terms/{id}", terms.Get)
		r.Post("/api/search-terms", terms.Create)
		r.Post("/api/search-terms/", terms.Create)
		r.Put("/api/search-terms/{id}", terms.Update)
		r.Delete("/api/search-terms/{id}", terms.Delete)

		// Catalog
		r.Get("/api/catalog", catalog.List)
		r.Get("/api/catalog/", catalog.List)
		r.Get("/api/catalog/{id}", catalog.Get)
		r.Put("/api/catalog/{id}", catalog.Update)
		r.Delete("/api/catalog/{id}", catalog.Delete)
		r.Get("/api/catalog/variants/{variant_id}/history", catalog.ListVariantHistory)
		r.Get("/api/catalog/keywords", catalog.ListKeywords)
		r.Get("/api/catalog/keywords/", catalog.ListKeywords)

		// Channels
		r.Get("/api/channels", channels.List)
		r.Get("/api/channels/", channels.List)
		r.Get("/api/channels/{id}", channels.Get)
		r.Post("/api/channels", channels.Create)
		r.Post("/api/channels/", channels.Create)
		r.Put("/api/channels/{id}", channels.Update)
		r.Delete("/api/channels/{id}", channels.Delete)
		r.Post("/api/channels/{id}/targets", channels.CreateTarget)
		r.Patch("/api/channels/{id}/targets/{target_id}", channels.UpdateTarget)
		r.Delete("/api/channels/{id}/targets/{target_id}", channels.DeleteTarget)
		r.Post("/api/channels/{id}/rules", channels.CreateRule)
		r.Delete("/api/channels/{id}/rules/{rule_id}", channels.DeleteRule)

		// Config
		r.Get("/api/config", config.Get)
		r.Put("/api/config", config.Update)

		// Accounts — WhatsApp
		r.Get("/api/accounts/wa", accounts.ListWA)
		r.Post("/api/accounts/wa", accounts.CreateWA)
		r.Get("/api/accounts/wa/{id}", accounts.GetWA)
		r.Put("/api/accounts/wa/{id}", accounts.UpdateWA)
		r.Delete("/api/accounts/wa/{id}", accounts.DeleteWA)
		r.Get("/api/accounts/wa/{id}/status", accounts.WAStatus)

		// Accounts — Telegram
		r.Get("/api/accounts/tg", accounts.ListTG)
		r.Post("/api/accounts/tg", accounts.CreateTG)
		r.Put("/api/accounts/tg/{id}", accounts.UpdateTG)
		r.Delete("/api/accounts/tg/{id}", accounts.DeleteTG)

		// Crawl logs
		r.Get("/api/crawl-logs", crawlLogs.List)
		r.Get("/api/crawl-logs/", crawlLogs.List)

		// Broadcast
		r.Get("/api/broadcast", broadcast.List)
		r.Get("/api/broadcast/", broadcast.List)
		r.Post("/api/broadcast", broadcast.Create)
		r.Post("/api/broadcast/", broadcast.Create)

		// Analytics
		r.Get("/api/analytics/summary", analytics.Summary)

		// Telegram chats discovery
		r.Get("/api/telegram/chats", accounts.ListTGChats)

		// Legacy v1 groups
		r.Get("/api/groups", accounts.ListGroups)
		r.Get("/api/groups/", accounts.ListGroups)
	})

	return r
}
