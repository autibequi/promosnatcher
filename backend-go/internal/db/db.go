package db

import (
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func Open(dsn string) (*sqlx.DB, error) {
	driver, connStr, err := parseDSN(dsn)
	if err != nil {
		return nil, err
	}

	db, err := sqlx.Open(driver, connStr)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	if driver == "sqlite" {
		db.SetMaxOpenConns(1)
		db.SetMaxIdleConns(4)
		_, _ = db.Exec("PRAGMA journal_mode=WAL")
		_, _ = db.Exec("PRAGMA synchronous=NORMAL")
		_, _ = db.Exec("PRAGMA cache_size=-8000")
		_, _ = db.Exec("PRAGMA temp_store=MEMORY")
		_, _ = db.Exec("PRAGMA foreign_keys=ON")
	} else {
		db.SetMaxOpenConns(20)
		db.SetMaxIdleConns(5)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	return db, nil
}

// RunMigrations executa as migrations SQL em ordem.
// Cada arquivo .sql pode ter múltiplos statements separados por ponto-e-vírgula.
// Erros de "already exists" / "duplicate column" são silenciados.
func RunMigrations(db *sqlx.DB) error {
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	// Ordena por nome
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		data, err := migrationsFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read %s: %w", entry.Name(), err)
		}

		// Remove seções "-- migrate:down" e executa só a parte "up"
		content := string(data)
		if idx := strings.Index(content, "-- migrate:down"); idx != -1 {
			content = content[:idx]
		}
		// Remove comentários de seção
		content = strings.ReplaceAll(content, "-- migrate:up", "")

		// Executa cada statement
		for _, stmt := range splitStatements(content) {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if _, err := db.Exec(stmt); err != nil {
				errStr := err.Error()
				// Silencia erros de "já existe" — migrations idempotentes
				if strings.Contains(errStr, "already exists") ||
					strings.Contains(errStr, "duplicate column") ||
					strings.Contains(errStr, "table already exists") ||
					strings.Contains(errStr, "no such table") {
					continue
				}
				// Para outros erros de ALTER TABLE (SQLite não suporta IF NOT EXISTS)
				if strings.Contains(strings.ToUpper(stmt), "ALTER TABLE") {
					continue
				}
			}
		}
	}
	return nil
}

func splitStatements(sql string) []string {
	var stmts []string
	current := strings.Builder{}
	for _, line := range strings.Split(sql, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--") {
			continue
		}
		current.WriteString(line)
		current.WriteByte('\n')
		if strings.HasSuffix(trimmed, ";") {
			stmts = append(stmts, current.String())
			current.Reset()
		}
	}
	if s := strings.TrimSpace(current.String()); s != "" {
		stmts = append(stmts, s)
	}
	return stmts
}

func parseDSN(dsn string) (driver, connStr string, err error) {
	switch {
	case strings.HasPrefix(dsn, "sqlite://"):
		// sqlite:///abs/path → /abs/path  (preserva a / do path absoluto)
		// sqlite://rel/path → rel/path
		return "sqlite", strings.TrimPrefix(dsn, "sqlite://"), nil
	case strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://"):
		return "postgres", dsn, nil
	default:
		// Assume sqlite path direto
		return "sqlite", dsn, nil
	}
}
