package config

import (
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
}

func Load() Config {
	c := Config{
		DatabaseURL:   env("DATABASE_URL", "data/app.db"),
		Port:          env("PORT", "8000"),
		JWTSecret:     env("JWT_SECRET", "changeme"),
		AdminUser:     env("ADMIN_USER", "admin"),
		AdminPass:     env("ADMIN_PASS", "admin"),
		ScanInterval:  envInt("SCAN_INTERVAL", 30),
		PublicBaseURL: env("PUBLIC_BASE_URL", "http://localhost:8000"),
		GOMAXPROCS:    envInt("GOMAXPROCS", 2),
	}
	return c
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
