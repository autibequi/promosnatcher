-- Create sources table for plugin architecture
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('ecommerce', 'cdkey')),
    enabled INTEGER NOT NULL DEFAULT 1,
    config_json TEXT
);

-- Seed with initial marketplace sources
INSERT OR IGNORE INTO sources (id, name, category, enabled) VALUES
    ('ml',  'Mercado Livre', 'ecommerce', 1),
    ('amz', 'Amazon',        'ecommerce', 1);
