package testutil

import (
	"net/http/httptest"
	"testing"

	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/redirect"
	"snatcher/backendv2/internal/router"
	"snatcher/backendv2/internal/scheduler"
	"snatcher/backendv2/internal/store"

	"github.com/jmoiron/sqlx"
)

// TestServer agrega o httptest.Server e os componentes injetáveis usados em
// asserts (store para inserir fixtures, secret para gerar JWTs).
type TestServer struct {
	*httptest.Server
	Store      store.Store
	JWTSecret  string
	AdminUser  string
	AdminPass  string
	DB         *sqlx.DB
}

// NewTestServer monta o router real (mesmo Build da produção), com pipeline e
// scheduler instanciados sobre mapas vazios — endpoints que disparariam crawl
// real são exercidos apenas via DB direto pelo store.
func NewTestServer(t *testing.T, db *sqlx.DB) *TestServer {
	t.Helper()

	st := store.New(db)

	rd := redirect.New(db, st)

	scrapers := map[string]pipeline.Scraper{}
	adapters := pipeline.AdapterRegistry{}

	runner := pipeline.NewRunner(st, scrapers, adapters)
	sched, err := scheduler.New(60, runner, nil)
	if err != nil {
		t.Fatalf("scheduler.New: %v", err)
	}

	const (
		jwtSecret = "test-secret-please-change"
		adminUser = "admin"
		adminPass = "admin-test-pass"
	)

	h := router.Build(st, rd, runner, sched, scrapers, adapters, jwtSecret, adminUser, adminPass)
	srv := httptest.NewServer(h)

	t.Cleanup(srv.Close)

	return &TestServer{
		Server:    srv,
		Store:     st,
		JWTSecret: jwtSecret,
		AdminUser: adminUser,
		AdminPass: adminPass,
		DB:        db,
	}
}
