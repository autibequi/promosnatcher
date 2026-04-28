package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"snatcher/backendv2/internal/adapters"
	"snatcher/backendv2/internal/config"
	appdb "snatcher/backendv2/internal/db"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/redirect"
	"snatcher/backendv2/internal/router"
	"snatcher/backendv2/internal/scheduler"
	"snatcher/backendv2/internal/scrapers"
	"snatcher/backendv2/internal/store"
)

func main() {
	cfg := config.Load()

	if cfg.GOMAXPROCS > 0 {
		runtime.GOMAXPROCS(cfg.GOMAXPROCS)
	}

	// DB
	db, err := appdb.Open(cfg.DatabaseURL)
	if err != nil {
		slog.Error("open db", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := appdb.RunMigrations(db); err != nil {
		slog.Error("migrations", "err", err)
		os.Exit(1)
	}

	// Store
	st := store.New(db)

	// Redirect (prewarm antes de aceitar tráfego)
	rd := redirect.New(db, st)
	rd.Prewarm()

	// Scrapers
	appCfg, _ := st.GetConfig()
	mlScraper := scrapers.NewMLScraper(
		appCfg.MLClientID.String,
		appCfg.MLClientSecret.String,
	)
	amzScraper := scrapers.NewAmazonScraper()

	scraperMap := map[string]pipeline.Scraper{
		"mercadolivre": mlScraper,
		"amazon":       amzScraper,
	}

	// Adapters de mensagem
	adapterMap := pipeline.AdapterRegistry{}

	// WhatsApp (Evolution)
	if appCfg.WABaseURL.Valid && appCfg.WAApiKey.Valid && appCfg.WAInstance.Valid {
		evo := adapters.NewEvolution(
			appCfg.WABaseURL.String,
			appCfg.WAApiKey.String,
			appCfg.WAInstance.String,
		)
		adapterMap["whatsapp"] = evo
	}

	// Telegram
	if appCfg.TGEnabled && appCfg.TGBotToken.Valid {
		tg, err := adapters.NewTelegram(appCfg.TGBotToken.String)
		if err != nil {
			slog.Warn("telegram init failed", "err", err)
		} else {
			adapterMap["telegram"] = tg
		}
	}

	// Pipeline runner
	runner := pipeline.NewRunner(st, scraperMap, adapterMap)

	// Scheduler
	sched, err := scheduler.New(cfg.ScanInterval, runner, nil)
	if err != nil {
		slog.Error("scheduler init", "err", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := sched.Start(ctx); err != nil {
		slog.Error("scheduler start", "err", err)
		os.Exit(1)
	}
	defer sched.Stop()

	// HTTP server
	h := router.Build(st, rd, runner, sched, cfg.JWTSecret, cfg.AdminUser, cfg.AdminPass)
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      h,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("backendv2 starting", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down...")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutCancel()
	_ = srv.Shutdown(shutCtx)
}
