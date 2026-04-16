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
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode"

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
	configMu     sync.RWMutex
	configVal    configEntry
)

const (
	productTTL = 1 * time.Hour
	configTTL  = 5 * time.Minute
)

// ---------------------------------------------------------------------------
// DB + prepared statement
// ---------------------------------------------------------------------------

var (
	db          *sql.DB
	stmtProduct *sql.Stmt // SELECT url, source FROM product WHERE short_id = ?
)

func openDB(path string) error {
	dsn := path + "?mode=ro&_journal_mode=WAL"
	var err error
	db, err = sql.Open("sqlite", dsn)
	if err != nil {
		return fmt.Errorf("open: %w", err)
	}
	// Read-only: 4 conexões paralelas ao SQLite são mais que suficientes
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(0)

	if err = db.Ping(); err != nil {
		return fmt.Errorf("ping: %w", err)
	}

	// Prepara query de produto uma vez (evita recompilar a cada cache miss)
	stmtProduct, err = db.Prepare(
		`SELECT url, source FROM product WHERE short_id = ? LIMIT 1`,
	)
	return err
}

// ---------------------------------------------------------------------------
// Pre-warm: carrega todos os produtos na memória no boot
// Após isso, requests não tocam o SQLite (só novos produtos geram miss)
// ---------------------------------------------------------------------------

func prewarm() {
	amzTag, mlToolID := getConfig()

	rows, err := db.Query(
		`SELECT short_id, url, source FROM product WHERE short_id IS NOT NULL AND short_id != ''`,
	)
	if err != nil {
		log.Printf("prewarm: %v", err)
		return
	}
	defer rows.Close()

	expires := time.Now().Add(productTTL)
	n := 0
	for rows.Next() {
		var shortID, rawURL, source string
		if err := rows.Scan(&shortID, &rawURL, &source); err != nil {
			continue
		}
		productCache.Store(shortID, productEntry{
			redirectURL: affiliateURL(rawURL, source, amzTag, mlToolID),
			expiresAt:   expires,
		})
		n++
	}
	log.Printf("prewarm: %d produtos em memória", n)
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
// Config cache com RWMutex — leitores concorrentes sem bloqueio
// ---------------------------------------------------------------------------

func getConfig() (amzTag, mlToolID string) {
	// Fast path: leitura concorrente
	configMu.RLock()
	if time.Now().Before(configVal.validAt) {
		a, m := configVal.amzTag, configVal.mlToolID
		configMu.RUnlock()
		return a, m
	}
	configMu.RUnlock()

	// Slow path: refresh do banco
	configMu.Lock()
	defer configMu.Unlock()

	// Double-check após adquirir write lock
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

// ---------------------------------------------------------------------------
// Resolve — cache primeiro, SQLite só em miss
// ---------------------------------------------------------------------------

func resolve(shortID string) (string, bool) {
	if v, ok := productCache.Load(shortID); ok {
		e := v.(productEntry)
		if time.Now().Before(e.expiresAt) {
			return e.redirectURL, true
		}
		productCache.Delete(shortID)
	}

	// Cache miss: consulta SQLite via prepared statement
	var rawURL, source string
	if err := stmtProduct.QueryRow(shortID).Scan(&rawURL, &source); err != nil {
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
// Validação de shortID (7 chars alfanuméricos — evita SQLite desnecessário)
// ---------------------------------------------------------------------------

func validShortID(s string) bool {
	if len(s) < 4 || len(s) > 16 {
		return false
	}
	for _, c := range s {
		if !unicode.IsLetter(c) && !unicode.IsDigit(c) {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

func handleRedirect(w http.ResponseWriter, r *http.Request) {
	shortID := r.PathValue("shortID")
	if !validShortID(shortID) {
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
	fmt.Fprint(w, "ok")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	// GOMAXPROCS: padrão 2 no Pi (IO-bound, cede CPU pros outros containers)
	if p := os.Getenv("GOMAXPROCS"); p == "" {
		runtime.GOMAXPROCS(2)
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/data/app.db"
	}

	if err := openDB(dbPath); err != nil {
		log.Fatalf("db: %v", err)
	}
	defer db.Close()
	defer stmtProduct.Close()

	// Carrega todos os produtos em memória antes de aceitar tráfego
	prewarm()

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
		log.Printf("redirect service :8081 db=%s", dbPath)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("serve: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}
