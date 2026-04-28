package pipeline

import (
	"context"
	"log/slog"
	"snatcher/backendv2/internal/store"
)

// Runner orquestra as 3 etapas do pipeline.
type Runner struct {
	store    store.Store
	scrapers map[string]Scraper
	adapters AdapterRegistry
}

func NewRunner(st store.Store, scrapers map[string]Scraper, adapters AdapterRegistry) *Runner {
	return &Runner{store: st, scrapers: scrapers, adapters: adapters}
}

// Run executa o pipeline completo: crawl → process → evaluate.
func (r *Runner) Run(ctx context.Context) error {
	slog.Info("pipeline: start crawl")
	if err := CrawlAllTerms(ctx, r.store, r.scrapers); err != nil {
		slog.Error("pipeline: crawl", "err", err)
	}

	slog.Info("pipeline: start process")
	if err := ProcessCrawlResults(ctx, r.store); err != nil {
		slog.Error("pipeline: process", "err", err)
	}

	slog.Info("pipeline: start evaluate")
	if err := EvaluateAndSend(ctx, r.store, r.adapters); err != nil {
		slog.Error("pipeline: evaluate", "err", err)
	}

	slog.Info("pipeline: done")
	return nil
}
