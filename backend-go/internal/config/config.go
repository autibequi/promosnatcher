package config

import (
	"errors"
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL   string
	Port          string
	JWTSecret     string
	AdminUser     string
	AdminPass     string
	ScanInterval  int
	PublicBaseURL string // ex: https://snatcher.com (para links curtos)
	GOMAXPROCS    int
	ENV           string // "dev" (default) | "prod" | "staging" etc.
}

// Load reads configuration from environment variables and performs fail-fast
// validation for production environments.
//
// In non-dev environments (ENV != "dev") it returns an error when insecure
// defaults are detected so the caller (main.go) can call log.Fatal and abort
// before accepting any traffic.
func Load() (Config, error) {
	c := Config{
		DatabaseURL:   env("DATABASE_URL", "data/app.db"),
		Port:          env("PORT", "8000"),
		JWTSecret:     env("JWT_SECRET", "changeme"),
		AdminUser:     env("ADMIN_USER", "admin"),
		AdminPass:     env("ADMIN_PASS", "admin"),
		ScanInterval:  envInt("SCAN_INTERVAL", 30),
		PublicBaseURL: env("PUBLIC_BASE_URL", "http://localhost:8000"),
		GOMAXPROCS:    envInt("GOMAXPROCS", 2),
		ENV:           env("ENV", "dev"),
	}

	if c.ENV != "dev" {
		if c.JWTSecret == "changeme" {
			return Config{}, errors.New("config: JWT_SECRET must not be the default value 'changeme' in non-dev environments")
		}
		if c.AdminPass == "admin" {
			return Config{}, errors.New("config: ADMIN_PASS must not be the default value 'admin' in non-dev environments")
		}
	}

	return c, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
