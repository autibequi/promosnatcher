-- Drop affiliate fields from SearchTerm and AppConfig
-- SQLite doesn't support ALTER TABLE DROP COLUMN until 3.35+, so we recreate the tables

-- Step 1: Rename old tables
ALTER TABLE IF EXISTS searchterm RENAME TO _old_searchterm;
ALTER TABLE IF EXISTS appconfig RENAME TO _old_appconfig;

-- Step 2: Create new SearchTerm without affiliate fields
CREATE TABLE searchterm (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    queries TEXT,
    min_val REAL,
    max_val REAL,
    sources TEXT,
    active INTEGER DEFAULT 1,
    crawl_interval INTEGER,
    last_crawled_at TIMESTAMP,
    result_count INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Copy data from old table
INSERT INTO searchterm (id, query, queries, min_val, max_val, sources, active, crawl_interval, last_crawled_at, result_count, created_at)
SELECT id, query, queries, min_val, max_val, sources, active, crawl_interval, last_crawled_at, result_count, created_at
FROM _old_searchterm;

-- Step 4: Create new AppConfig without affiliate fields
CREATE TABLE appconfig (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_provider TEXT,
    wa_base_url TEXT,
    wa_api_key TEXT,
    wa_instance TEXT,
    global_interval INTEGER,
    send_start_hour INTEGER,
    send_end_hour INTEGER,
    ml_client_id TEXT,
    ml_client_secret TEXT,
    wa_group_prefix TEXT,
    alert_phone TEXT,
    use_short_links INTEGER DEFAULT 0,
    tg_enabled INTEGER DEFAULT 0,
    tg_bot_token TEXT,
    tg_bot_username TEXT,
    tg_group_prefix TEXT,
    tg_last_update_id INTEGER
);

-- Step 5: Copy data from old AppConfig table
INSERT INTO appconfig (id, wa_provider, wa_base_url, wa_api_key, wa_instance, global_interval, send_start_hour, send_end_hour, ml_client_id, ml_client_secret, wa_group_prefix, alert_phone, use_short_links, tg_enabled, tg_bot_token, tg_bot_username, tg_group_prefix, tg_last_update_id)
SELECT id, wa_provider, wa_base_url, wa_api_key, wa_instance, global_interval, send_start_hour, send_end_hour, ml_client_id, ml_client_secret, wa_group_prefix, alert_phone, use_short_links, tg_enabled, tg_bot_token, tg_bot_username, tg_group_prefix, tg_last_update_id
FROM _old_appconfig;

-- Step 6: Drop old tables
DROP TABLE _old_searchterm;
DROP TABLE _old_appconfig;
