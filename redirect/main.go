package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	_ "modernc.org/sqlite"
)

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

type productEntry struct {
	redirectURL string
	expiresAt   time.Time
}

type configEntry struct {
	amzTag   string
	mlToolID string
	validAt  time.Time
}

var (
	productCache sync.Map // string -> productEntry
	configMu     sync.Mutex
	configVal    configEntry
)

const (
	productTTL = 1 * time.Hour
	configTTL  = 5 * time.Minute
)

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

var db *sql.DB

func openDB(path string) error {
	// mode=ro: read-only; _journal_mode=WAL: non-blocking alongside Python writer
	dsn := path + "?mode=ro&_journal_mode=WAL"
	var err error
	db, err = sql.Open("sqlite", dsn)
	if err != nil {
		return fmt.Errorf("open: %w", err)
	}
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(8)
	db.SetConnMaxLifetime(0)
	return db.Ping()
}

// ---------------------------------------------------------------------------
// Affiliate URL — mesma lógica do Python
// ---------------------------------------------------------------------------

func affiliateURL(rawURL, source, amzTag, mlToolID string) string {
	switch source {
	case "amazon":
		if amzTag == "" {
			return rawURL
		}
		// Amazon: substitui toda a query por ?tag= (igual ao Python)
		u, err := url.Parse(rawURL)
		if err != nil {
			return rawURL
		}
		u.RawQuery = "tag=" + url.QueryEscape(amzTag)
		u.Fragment = ""
		return u.String()

	case "mercadolivre":
		if mlToolID == "" {
			return rawURL
		}
		sep := "?"
		if strings.Contains(rawURL, "?") {
			sep = "&"
		}
		return fmt.Sprintf("%s%smatt_tool=%s&matt_source=affiliate",
			rawURL, sep, url.QueryEscape(mlToolID))
	}
	return rawURL
}

// ---------------------------------------------------------------------------
// Resolve — SQLite + in-memory cache
// ---------------------------------------------------------------------------

func getConfig() (amzTag, mlToolID string) {
	configMu.Lock()
	defer configMu.Unlock()

	if time.Now().Before(configVal.validAt) {
		return configVal.amzTag, configVal.mlToolID
	}

	var amz, ml sql.NullString
	_ = db.QueryRow(
		`SELECT amz_tracking_id, ml_affiliate_tool_id FROM appconfig WHERE id = 1`,
	).Scan(&amz, &ml)

	configVal = configEntry{
		amzTag:   amz.String,
		mlToolID: ml.String,
		validAt:  time.Now().Add(configTTL),
	}
	return configVal.amzTag, configVal.mlToolID
}

func resolve(shortID string) (string, bool) {
	// Cache hit
	if v, ok := productCache.Load(shortID); ok {
		e := v.(productEntry)
		if time.Now().Before(e.expiresAt) {
			return e.redirectURL, true
		}
		productCache.Delete(shortID)
	}

	// SQLite lookup
	var rawURL, source string
	err := db.QueryRow(
		`SELECT url, source FROM product WHERE short_id = ? LIMIT 1`,
		shortID,
	).Scan(&rawURL, &source)
	if err != nil {
		return "", false
	}

	amzTag, mlToolID := getConfig()
	dest := affiliateURL(rawURL, source, amzTag, mlToolID)

	productCache.Store(shortID, productEntry{
		redirectURL: dest,
		expiresAt:   time.Now().Add(productTTL),
	})
	return dest, true
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

func handleRedirect(w http.ResponseWriter, r *http.Request) {
	shortID := r.PathValue("shortID")
	if shortID == "" {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}

	dest, ok := resolve(shortID)
	if !ok {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}

	h := w.Header()
	h.Set("Cache-Control", "public, max-age=31536000, immutable")
	h.Set("CDN-Cache-Control", "public, max-age=31536000")
	h.Set("Location", dest)
	w.WriteHeader(http.StatusMovedPermanently)
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprint(w, "ok")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/data/app.db"
	}

	if err := openDB(dbPath); err != nil {
		log.Fatalf("db: %v", err)
	}
	defer db.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /r/{shortID}", handleRedirect)
	mux.HandleFunc("GET /health", handleHealth)

	srv := &http.Server{
		Addr:         ":8081",
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("redirect service :8081 — db=%s", dbPath)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("serve: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
