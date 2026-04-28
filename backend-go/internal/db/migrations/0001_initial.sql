-- migrate:up

CREATE TABLE IF NOT EXISTS appconfig (
    id INTEGER PRIMARY KEY DEFAULT 1,
    wa_provider TEXT NOT NULL DEFAULT 'evolution',
    wa_base_url TEXT,
    wa_api_key TEXT,
    wa_instance TEXT,
    global_interval INTEGER NOT NULL DEFAULT 30,
    send_start_hour INTEGER NOT NULL DEFAULT 8,
    send_end_hour INTEGER NOT NULL DEFAULT 22,
    ml_client_id TEXT,
    ml_client_secret TEXT,
    wa_group_prefix TEXT DEFAULT 'Snatcher',
    amz_tracking_id TEXT,
    ml_affiliate_tool_id TEXT,
    alert_phone TEXT,
    use_short_links BOOLEAN NOT NULL DEFAULT 1,
    tg_enabled BOOLEAN NOT NULL DEFAULT 0,
    tg_bot_token TEXT,
    tg_bot_username TEXT,
    tg_group_prefix TEXT DEFAULT 'Snatcher',
    tg_last_update_id INTEGER
);

INSERT OR IGNORE INTO appconfig (id) VALUES (1);

CREATE TABLE IF NOT EXISTS waaccount (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'evolution',
    base_url TEXT,
    api_key TEXT,
    instance TEXT DEFAULT 'default',
    group_prefix TEXT DEFAULT 'Snatcher',
    status TEXT NOT NULL DEFAULT 'disconnected',
    active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tgaccount (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    bot_token TEXT,
    bot_username TEXT,
    group_prefix TEXT DEFAULT 'Snatcher',
    last_update_id INTEGER,
    active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Legacy v1 tables

CREATE TABLE IF NOT EXISTS "group" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    search_prompt TEXT NOT NULL,
    min_val REAL NOT NULL,
    max_val REAL NOT NULL,
    whatsapp_group_id TEXT,
    wa_group_status TEXT,
    telegram_chat_id TEXT,
    tg_group_status TEXT,
    message_template TEXT,
    active BOOLEAN NOT NULL DEFAULT 1,
    scan_interval INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES "group"(id),
    title TEXT NOT NULL,
    price REAL NOT NULL,
    url TEXT NOT NULL,
    image_url TEXT,
    source TEXT NOT NULL,
    short_id TEXT,
    family_key TEXT,
    found_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_short_id ON product(short_id);
CREATE INDEX IF NOT EXISTS idx_product_group_id ON product(group_id);

CREATE TABLE IF NOT EXISTS pricehistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES product(id),
    price REAL NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scanjob (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES "group"(id),
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    products_found INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    error_msg TEXT
);

CREATE TABLE IF NOT EXISTS clicklog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES product(id),
    clicked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_hash TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    referrer TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_clicklog_product ON clicklog(product_id);

CREATE TABLE IF NOT EXISTS sentmessage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES product(id),
    provider TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    is_drop BOOLEAN NOT NULL DEFAULT 0,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegramchat (
    chat_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    username TEXT,
    member_count INTEGER,
    is_admin BOOLEAN NOT NULL DEFAULT 0,
    discovered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    linked_group_id INTEGER REFERENCES "group"(id),
    linked_channel_id INTEGER
);

-- v2 pipeline tables

CREATE TABLE IF NOT EXISTS searchterm (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    queries TEXT NOT NULL DEFAULT '[]',
    min_val REAL NOT NULL DEFAULT 0,
    max_val REAL NOT NULL DEFAULT 9999,
    sources TEXT NOT NULL DEFAULT 'all',
    active BOOLEAN NOT NULL DEFAULT 1,
    crawl_interval INTEGER NOT NULL DEFAULT 30,
    last_crawled_at TIMESTAMP,
    result_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ml_affiliate_tool_id TEXT,
    amz_tracking_id TEXT
);

CREATE TABLE IF NOT EXISTS catalogproduct (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_name TEXT NOT NULL,
    brand TEXT,
    weight TEXT,
    image_url TEXT,
    lowest_price REAL,
    lowest_price_url TEXT,
    lowest_price_source TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalogproduct_name ON catalogproduct(canonical_name);

CREATE TABLE IF NOT EXISTS catalogvariant (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_product_id INTEGER NOT NULL REFERENCES catalogproduct(id),
    title TEXT NOT NULL,
    variant_label TEXT,
    price REAL NOT NULL,
    url TEXT NOT NULL UNIQUE,
    image_url TEXT,
    source TEXT NOT NULL,
    first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalogvariant_product ON catalogvariant(catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_catalogvariant_url ON catalogvariant(url);

CREATE TABLE IF NOT EXISTS crawlresult (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_term_id INTEGER NOT NULL REFERENCES searchterm(id),
    title TEXT NOT NULL,
    price REAL NOT NULL,
    url TEXT NOT NULL,
    image_url TEXT,
    source TEXT NOT NULL,
    crawled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    catalog_variant_id INTEGER REFERENCES catalogvariant(id)
);

CREATE INDEX IF NOT EXISTS idx_crawlresult_term ON crawlresult(search_term_id);

CREATE TABLE IF NOT EXISTS pricehistoryv2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL REFERENCES catalogvariant(id),
    price REAL NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pricehistoryv2_variant ON pricehistoryv2(variant_id);

CREATE TABLE IF NOT EXISTS groupingkeyword (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL UNIQUE,
    tag TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS channel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    slug TEXT UNIQUE,
    message_template TEXT,
    send_start_hour INTEGER NOT NULL DEFAULT 8,
    send_end_hour INTEGER NOT NULL DEFAULT 22,
    digest_mode BOOLEAN NOT NULL DEFAULT 0,
    digest_max_items INTEGER NOT NULL DEFAULT 5,
    active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_channel_slug ON channel(slug);

CREATE TABLE IF NOT EXISTS channeltarget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channel(id),
    provider TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    name TEXT,
    invite_url TEXT,
    status TEXT NOT NULL DEFAULT 'ok'
);

CREATE INDEX IF NOT EXISTS idx_channeltarget_channel ON channeltarget(channel_id);

CREATE TABLE IF NOT EXISTS channelrule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channel(id),
    match_type TEXT NOT NULL,
    match_value TEXT,
    max_price REAL,
    notify_new BOOLEAN NOT NULL DEFAULT 1,
    notify_drop BOOLEAN NOT NULL DEFAULT 0,
    notify_lowest BOOLEAN NOT NULL DEFAULT 0,
    drop_threshold REAL NOT NULL DEFAULT 0.10,
    active BOOLEAN NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_channelrule_channel ON channelrule(channel_id);

CREATE TABLE IF NOT EXISTS sentmessagev2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_product_id INTEGER NOT NULL REFERENCES catalogproduct(id),
    channel_target_id INTEGER NOT NULL REFERENCES channeltarget(id),
    is_drop BOOLEAN NOT NULL DEFAULT 0,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sentmessagev2_product ON sentmessagev2(catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_sentmessagev2_target ON sentmessagev2(channel_target_id);

CREATE TABLE IF NOT EXISTS crawllog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_term_id INTEGER NOT NULL REFERENCES searchterm(id),
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'running',
    ml_count INTEGER NOT NULL DEFAULT 0,
    amz_count INTEGER NOT NULL DEFAULT 0,
    error_msg TEXT
);

CREATE INDEX IF NOT EXISTS idx_crawllog_term ON crawllog(search_term_id);

CREATE TABLE IF NOT EXISTS broadcastmessage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    image_url TEXT,
    channel_ids TEXT NOT NULL DEFAULT 'all',
    status TEXT NOT NULL DEFAULT 'pending',
    sent_count INTEGER NOT NULL DEFAULT 0,
    sent_at TIMESTAMP,
    error_msg TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- migrate:down
-- (não implementado — schema deletado manualmente se necessário)
