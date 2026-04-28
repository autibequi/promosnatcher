package store

import (
	"database/sql"
	"fmt"
	"snatcher/backendv2/internal/models"
	"time"

	"github.com/jmoiron/sqlx"
)

type SQLStore struct {
	db *sqlx.DB
}

func New(db *sqlx.DB) Store {
	return &SQLStore{db: db}
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

func (s *SQLStore) GetConfig() (models.AppConfig, error) {
	var c models.AppConfig
	err := s.db.Get(&c, `SELECT * FROM appconfig WHERE id = 1`)
	return c, err
}

func (s *SQLStore) UpdateConfig(cfg models.AppConfig) error {
	_, err := s.db.NamedExec(`
		UPDATE appconfig SET
			wa_provider=:wa_provider, wa_base_url=:wa_base_url, wa_api_key=:wa_api_key,
			wa_instance=:wa_instance, global_interval=:global_interval,
			send_start_hour=:send_start_hour, send_end_hour=:send_end_hour,
			ml_client_id=:ml_client_id, ml_client_secret=:ml_client_secret,
			wa_group_prefix=:wa_group_prefix, amz_tracking_id=:amz_tracking_id,
			ml_affiliate_tool_id=:ml_affiliate_tool_id, alert_phone=:alert_phone,
			use_short_links=:use_short_links, tg_enabled=:tg_enabled,
			tg_bot_token=:tg_bot_token, tg_bot_username=:tg_bot_username,
			tg_group_prefix=:tg_group_prefix, tg_last_update_id=:tg_last_update_id
		WHERE id = 1`, cfg)
	return err
}

func (s *SQLStore) ListWAAccounts() ([]models.WAAccount, error) {
	var out []models.WAAccount
	err := s.db.Select(&out, `SELECT * FROM waaccount ORDER BY id`)
	return out, err
}

func (s *SQLStore) GetWAAccount(id int64) (models.WAAccount, error) {
	var a models.WAAccount
	err := s.db.Get(&a, `SELECT * FROM waaccount WHERE id = ?`, id)
	return a, err
}

func (s *SQLStore) CreateWAAccount(a models.WAAccount) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO waaccount (name, provider, base_url, api_key, instance, group_prefix, status, active)
		VALUES (:name, :provider, :base_url, :api_key, :instance, :group_prefix, :status, :active)`, a)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) UpdateWAAccount(a models.WAAccount) error {
	_, err := s.db.NamedExec(`
		UPDATE waaccount SET name=:name, provider=:provider, base_url=:base_url,
			api_key=:api_key, instance=:instance, group_prefix=:group_prefix,
			status=:status, active=:active
		WHERE id = :id`, a)
	return err
}

func (s *SQLStore) DeleteWAAccount(id int64) error {
	_, err := s.db.Exec(`DELETE FROM waaccount WHERE id = ?`, id)
	return err
}

func (s *SQLStore) ListTGAccounts() ([]models.TGAccount, error) {
	var out []models.TGAccount
	err := s.db.Select(&out, `SELECT * FROM tgaccount ORDER BY id`)
	return out, err
}

func (s *SQLStore) GetTGAccount(id int64) (models.TGAccount, error) {
	var a models.TGAccount
	err := s.db.Get(&a, `SELECT * FROM tgaccount WHERE id = ?`, id)
	return a, err
}

func (s *SQLStore) CreateTGAccount(a models.TGAccount) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO tgaccount (name, bot_token, bot_username, group_prefix, active)
		VALUES (:name, :bot_token, :bot_username, :group_prefix, :active)`, a)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) UpdateTGAccount(a models.TGAccount) error {
	_, err := s.db.NamedExec(`
		UPDATE tgaccount SET name=:name, bot_token=:bot_token, bot_username=:bot_username,
			group_prefix=:group_prefix, last_update_id=:last_update_id, active=:active
		WHERE id = :id`, a)
	return err
}

func (s *SQLStore) DeleteTGAccount(id int64) error {
	_, err := s.db.Exec(`DELETE FROM tgaccount WHERE id = ?`, id)
	return err
}

// ---------------------------------------------------------------------------
// SearchTerms
// ---------------------------------------------------------------------------

func (s *SQLStore) ListSearchTerms() ([]models.SearchTerm, error) {
	var out []models.SearchTerm
	err := s.db.Select(&out, `SELECT * FROM searchterm ORDER BY id`)
	return out, err
}

func (s *SQLStore) GetSearchTerm(id int64) (models.SearchTerm, error) {
	var t models.SearchTerm
	err := s.db.Get(&t, `SELECT * FROM searchterm WHERE id = ?`, id)
	return t, err
}

func (s *SQLStore) CreateSearchTerm(t models.SearchTerm) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO searchterm (query, queries, min_val, max_val, sources, active, crawl_interval, ml_affiliate_tool_id, amz_tracking_id)
		VALUES (:query, :queries, :min_val, :max_val, :sources, :active, :crawl_interval, :ml_affiliate_tool_id, :amz_tracking_id)`, t)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) UpdateSearchTerm(t models.SearchTerm) error {
	_, err := s.db.NamedExec(`
		UPDATE searchterm SET query=:query, queries=:queries, min_val=:min_val, max_val=:max_val,
			sources=:sources, active=:active, crawl_interval=:crawl_interval,
			ml_affiliate_tool_id=:ml_affiliate_tool_id, amz_tracking_id=:amz_tracking_id
		WHERE id = :id`, t)
	return err
}

func (s *SQLStore) DeleteSearchTerm(id int64) error {
	_, err := s.db.Exec(`DELETE FROM searchterm WHERE id = ?`, id)
	return err
}

func (s *SQLStore) TouchSearchTerm(id int64, count int) error {
	_, err := s.db.Exec(`
		UPDATE searchterm SET last_crawled_at = CURRENT_TIMESTAMP, result_count = result_count + ?
		WHERE id = ?`, count, id)
	return err
}

// ---------------------------------------------------------------------------
// CrawlResults
// ---------------------------------------------------------------------------

func (s *SQLStore) InsertCrawlResult(r models.CrawlResult) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO crawlresult (search_term_id, title, price, url, image_url, source)
		VALUES (:search_term_id, :title, :price, :url, :image_url, :source)`, r)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) ListCrawlResultsByTerm(termID int64, limit, offset int) ([]models.CrawlResult, error) {
	var out []models.CrawlResult
	err := s.db.Select(&out,
		`SELECT * FROM crawlresult WHERE search_term_id = ? ORDER BY crawled_at DESC LIMIT ? OFFSET ?`,
		termID, limit, offset)
	return out, err
}

func (s *SQLStore) CountCrawlResultsByTerm(termID int64) (int64, error) {
	var count int64
	err := s.db.Get(&count, `SELECT COUNT(*) FROM crawlresult WHERE search_term_id = ?`, termID)
	return count, err
}

func (s *SQLStore) ListUnprocessedCrawlResults() ([]models.CrawlResult, error) {
	var out []models.CrawlResult
	err := s.db.Select(&out, `SELECT * FROM crawlresult WHERE catalog_variant_id IS NULL ORDER BY id`)
	return out, err
}

func (s *SQLStore) MarkCrawlResultProcessed(id int64, variantID int64) error {
	_, err := s.db.Exec(`UPDATE crawlresult SET catalog_variant_id = ? WHERE id = ?`, variantID, id)
	return err
}

func (s *SQLStore) URLAlreadyCrawled(searchTermID int64, url string) (bool, error) {
	var count int
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM crawlresult WHERE search_term_id = ? AND url = ?`, searchTermID, url)
	return count > 0, err
}

// ---------------------------------------------------------------------------
// CrawlLogs
// ---------------------------------------------------------------------------

func (s *SQLStore) InsertCrawlLog(l models.CrawlLog) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO crawllog (search_term_id, status, ml_count, amz_count)
		VALUES (:search_term_id, :status, :ml_count, :amz_count)`, l)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) UpdateCrawlLog(l models.CrawlLog) error {
	_, err := s.db.NamedExec(`
		UPDATE crawllog SET finished_at=:finished_at, status=:status,
			ml_count=:ml_count, amz_count=:amz_count, error_msg=:error_msg
		WHERE id = :id`, l)
	return err
}

func (s *SQLStore) ListCrawlLogs(termID int64, limit int) ([]models.CrawlLog, error) {
	var out []models.CrawlLog
	var err error
	if termID > 0 {
		err = s.db.Select(&out,
			`SELECT * FROM crawllog WHERE search_term_id = ? ORDER BY started_at DESC LIMIT ?`, termID, limit)
	} else {
		err = s.db.Select(&out,
			`SELECT * FROM crawllog ORDER BY started_at DESC LIMIT ?`, limit)
	}
	return out, err
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

func (s *SQLStore) ListCatalogProducts(limit, offset int) ([]models.CatalogProduct, error) {
	var out []models.CatalogProduct
	err := s.db.Select(&out,
		`SELECT * FROM catalogproduct ORDER BY updated_at DESC LIMIT ? OFFSET ?`, limit, offset)
	return out, err
}

func (s *SQLStore) GetCatalogProduct(id int64) (models.CatalogProduct, error) {
	var p models.CatalogProduct
	err := s.db.Get(&p, `SELECT * FROM catalogproduct WHERE id = ?`, id)
	return p, err
}

func (s *SQLStore) CreateCatalogProduct(p models.CatalogProduct) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO catalogproduct (canonical_name, brand, weight, image_url, lowest_price,
			lowest_price_url, lowest_price_source, tags)
		VALUES (:canonical_name, :brand, :weight, :image_url, :lowest_price,
			:lowest_price_url, :lowest_price_source, :tags)`, p)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) UpdateCatalogProduct(p models.CatalogProduct) error {
	p.UpdatedAt = time.Now()
	_, err := s.db.NamedExec(`
		UPDATE catalogproduct SET canonical_name=:canonical_name, brand=:brand, weight=:weight,
			image_url=:image_url, lowest_price=:lowest_price, lowest_price_url=:lowest_price_url,
			lowest_price_source=:lowest_price_source, tags=:tags, updated_at=:updated_at
		WHERE id = :id`, p)
	return err
}

func (s *SQLStore) DeleteCatalogProduct(id int64) error {
	_, err := s.db.Exec(`DELETE FROM catalogproduct WHERE id = ?`, id)
	return err
}

func (s *SQLStore) GetVariantByURL(url string) (models.CatalogVariant, bool, error) {
	var v models.CatalogVariant
	err := s.db.Get(&v, `SELECT * FROM catalogvariant WHERE url = ? LIMIT 1`, url)
	if err == sql.ErrNoRows {
		return v, false, nil
	}
	return v, err == nil, err
}

func (s *SQLStore) CreateCatalogVariant(v models.CatalogVariant) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO catalogvariant (catalog_product_id, title, variant_label, price, url, image_url, source)
		VALUES (:catalog_product_id, :title, :variant_label, :price, :url, :image_url, :source)`, v)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) UpdateCatalogVariant(v models.CatalogVariant) error {
	v.LastSeenAt = time.Now()
	_, err := s.db.NamedExec(`
		UPDATE catalogvariant SET price=:price, last_seen_at=:last_seen_at
		WHERE id = :id`, v)
	return err
}

func (s *SQLStore) ListVariantsByProduct(productID int64) ([]models.CatalogVariant, error) {
	var out []models.CatalogVariant
	err := s.db.Select(&out,
		`SELECT * FROM catalogvariant WHERE catalog_product_id = ? ORDER BY price`, productID)
	return out, err
}

func (s *SQLStore) InsertPriceHistoryV2(h models.PriceHistoryV2) error {
	_, err := s.db.NamedExec(`
		INSERT INTO pricehistoryv2 (variant_id, price) VALUES (:variant_id, :price)`, h)
	return err
}

func (s *SQLStore) ListPriceHistoryV2(variantID int64) ([]models.PriceHistoryV2, error) {
	var out []models.PriceHistoryV2
	err := s.db.Select(&out,
		`SELECT * FROM pricehistoryv2 WHERE variant_id = ? ORDER BY recorded_at DESC LIMIT 100`, variantID)
	return out, err
}

func (s *SQLStore) ListGroupingKeywords() ([]models.GroupingKeyword, error) {
	var out []models.GroupingKeyword
	err := s.db.Select(&out, `SELECT * FROM groupingkeyword WHERE active = 1 ORDER BY keyword`)
	return out, err
}

func (s *SQLStore) CreateGroupingKeyword(k models.GroupingKeyword) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO groupingkeyword (keyword, tag, active) VALUES (:keyword, :tag, :active)`, k)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) UpdateGroupingKeyword(k models.GroupingKeyword) error {
	_, err := s.db.NamedExec(`
		UPDATE groupingkeyword SET keyword=:keyword, tag=:tag, active=:active WHERE id = :id`, k)
	return err
}

func (s *SQLStore) DeleteGroupingKeyword(id int64) error {
	_, err := s.db.Exec(`DELETE FROM groupingkeyword WHERE id = ?`, id)
	return err
}

func (s *SQLStore) GetRecentlyUpdatedProducts(since time.Time) ([]models.CatalogProduct, error) {
	var out []models.CatalogProduct
	err := s.db.Select(&out,
		`SELECT * FROM catalogproduct WHERE updated_at >= ? ORDER BY updated_at DESC`, since)
	return out, err
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

func (s *SQLStore) ListChannels() ([]models.Channel, error) {
	var out []models.Channel
	err := s.db.Select(&out, `SELECT * FROM channel ORDER BY id`)
	return out, err
}

func (s *SQLStore) GetChannel(id int64) (models.Channel, error) {
	var c models.Channel
	err := s.db.Get(&c, `SELECT * FROM channel WHERE id = ?`, id)
	return c, err
}

func (s *SQLStore) GetChannelBySlug(slug string) (models.Channel, error) {
	var c models.Channel
	err := s.db.Get(&c, `SELECT * FROM channel WHERE slug = ?`, slug)
	return c, err
}

func (s *SQLStore) CreateChannel(c models.Channel) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO channel (name, description, slug, message_template, send_start_hour, send_end_hour,
			digest_mode, digest_max_items, active)
		VALUES (:name, :description, :slug, :message_template, :send_start_hour, :send_end_hour,
			:digest_mode, :digest_max_items, :active)`, c)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) UpdateChannel(c models.Channel) error {
	_, err := s.db.NamedExec(`
		UPDATE channel SET name=:name, description=:description, slug=:slug,
			message_template=:message_template, send_start_hour=:send_start_hour,
			send_end_hour=:send_end_hour, digest_mode=:digest_mode,
			digest_max_items=:digest_max_items, active=:active
		WHERE id = :id`, c)
	return err
}

func (s *SQLStore) DeleteChannel(id int64) error {
	_, err := s.db.Exec(`DELETE FROM channel WHERE id = ?`, id)
	return err
}

func (s *SQLStore) ListChannelTargets(channelID int64) ([]models.ChannelTarget, error) {
	var out []models.ChannelTarget
	err := s.db.Select(&out, `SELECT * FROM channeltarget WHERE channel_id = ? ORDER BY id`, channelID)
	return out, err
}

func (s *SQLStore) CreateChannelTarget(t models.ChannelTarget) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO channeltarget (channel_id, provider, chat_id, name, invite_url, status)
		VALUES (:channel_id, :provider, :chat_id, :name, :invite_url, :status)`, t)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) UpdateChannelTarget(t models.ChannelTarget) error {
	_, err := s.db.NamedExec(`
		UPDATE channeltarget SET provider=:provider, chat_id=:chat_id, name=:name,
			invite_url=:invite_url, status=:status
		WHERE id = :id`, t)
	return err
}

func (s *SQLStore) DeleteChannelTarget(id int64) error {
	_, err := s.db.Exec(`DELETE FROM channeltarget WHERE id = ?`, id)
	return err
}

func (s *SQLStore) ListChannelRules(channelID int64) ([]models.ChannelRule, error) {
	var out []models.ChannelRule
	err := s.db.Select(&out, `SELECT * FROM channelrule WHERE channel_id = ? ORDER BY id`, channelID)
	return out, err
}

func (s *SQLStore) CreateChannelRule(r models.ChannelRule) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO channelrule (channel_id, match_type, match_value, max_price,
			notify_new, notify_drop, notify_lowest, drop_threshold, active)
		VALUES (:channel_id, :match_type, :match_value, :max_price,
			:notify_new, :notify_drop, :notify_lowest, :drop_threshold, :active)`, r)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) UpdateChannelRule(r models.ChannelRule) error {
	_, err := s.db.NamedExec(`
		UPDATE channelrule SET match_type=:match_type, match_value=:match_value,
			max_price=:max_price, notify_new=:notify_new, notify_drop=:notify_drop,
			notify_lowest=:notify_lowest, drop_threshold=:drop_threshold, active=:active
		WHERE id = :id`, r)
	return err
}

func (s *SQLStore) DeleteChannelRule(id int64) error {
	_, err := s.db.Exec(`DELETE FROM channelrule WHERE id = ?`, id)
	return err
}

func (s *SQLStore) WasSentRecently(productID, targetID int64, since time.Time) (bool, error) {
	var count int
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM sentmessagev2 WHERE catalog_product_id = ? AND channel_target_id = ? AND sent_at >= ?`,
		productID, targetID, since)
	return count > 0, err
}

func (s *SQLStore) RecordSent(sv models.SentMessageV2) error {
	_, err := s.db.NamedExec(`
		INSERT INTO sentmessagev2 (catalog_product_id, channel_target_id, is_drop)
		VALUES (:catalog_product_id, :channel_target_id, :is_drop)`, sv)
	return err
}

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

func (s *SQLStore) CreateBroadcast(b models.BroadcastMessage) (int64, error) {
	res, err := s.db.NamedExec(`
		INSERT INTO broadcastmessage (text, image_url, channel_ids, status)
		VALUES (:text, :image_url, :channel_ids, :status)`, b)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *SQLStore) UpdateBroadcast(b models.BroadcastMessage) error {
	_, err := s.db.NamedExec(`
		UPDATE broadcastmessage SET status=:status, sent_count=:sent_count,
			sent_at=:sent_at, error_msg=:error_msg
		WHERE id = :id`, b)
	return err
}

func (s *SQLStore) ListBroadcasts(limit int) ([]models.BroadcastMessage, error) {
	var out []models.BroadcastMessage
	err := s.db.Select(&out,
		`SELECT * FROM broadcastmessage ORDER BY created_at DESC LIMIT ?`, limit)
	return out, err
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

func (s *SQLStore) CountClicksByProduct(productID int64) (int64, error) {
	var count int64
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM clicklog WHERE product_id = ?`, productID)
	return count, err
}

func (s *SQLStore) InsertClickLog(l models.ClickLog) error {
	_, err := s.db.NamedExec(`
		INSERT INTO clicklog (product_id, ip_hash, user_agent, referrer)
		VALUES (:product_id, :ip_hash, :user_agent, :referrer)`, l)
	return err
}

// ---------------------------------------------------------------------------
// Legacy
// ---------------------------------------------------------------------------

func (s *SQLStore) ListGroups() ([]models.Group, error) {
	var out []models.Group
	err := s.db.Select(&out, `SELECT * FROM "group" ORDER BY id`)
	return out, err
}

func (s *SQLStore) GetGroup(id int64) (models.Group, error) {
	var g models.Group
	err := s.db.Get(&g, `SELECT * FROM "group" WHERE id = ?`, id)
	return g, err
}

func (s *SQLStore) ListProductsByGroup(groupID int64, limit int) ([]models.Product, error) {
	var out []models.Product
	err := s.db.Select(&out,
		`SELECT * FROM product WHERE group_id = ? ORDER BY found_at DESC LIMIT ?`, groupID, limit)
	return out, err
}

func (s *SQLStore) GetProductByShortID(shortID string) (models.Product, bool, error) {
	var p models.Product
	err := s.db.Get(&p, `SELECT * FROM product WHERE short_id = ? LIMIT 1`, shortID)
	if err == sql.ErrNoRows {
		return p, false, nil
	}
	return p, err == nil, err
}

// ---------------------------------------------------------------------------
// TelegramChat
// ---------------------------------------------------------------------------

func (s *SQLStore) UpsertTelegramChat(c models.TelegramChat) error {
	_, err := s.db.NamedExec(`
		INSERT INTO telegramchat (chat_id, type, title, username, member_count, is_admin)
		VALUES (:chat_id, :type, :title, :username, :member_count, :is_admin)
		ON CONFLICT(chat_id) DO UPDATE SET
			title=excluded.title, username=excluded.username,
			member_count=excluded.member_count, is_admin=excluded.is_admin,
			last_seen_at=CURRENT_TIMESTAMP`, c)
	return err
}

func (s *SQLStore) ListTelegramChats() ([]models.TelegramChat, error) {
	var out []models.TelegramChat
	err := s.db.Select(&out, `SELECT * FROM telegramchat ORDER BY last_seen_at DESC`)
	return out, err
}

func (s *SQLStore) GetAnalyticsSummary(since time.Time, days int) (map[string]any, error) {
	var total, unique int64
	_ = s.db.Get(&total, `SELECT COUNT(*) FROM clicklog WHERE clicked_at >= ?`, since)
	_ = s.db.Get(&unique, `SELECT COUNT(DISTINCT ip_hash) FROM clicklog WHERE clicked_at >= ?`, since)

	type dailyRow struct {
		Day    string `db:"day"`
		Clicks int    `db:"clicks"`
	}
	var daily []dailyRow
	_ = s.db.Select(&daily, `
		SELECT strftime('%Y-%m-%d', clicked_at) AS day, COUNT(*) AS clicks
		FROM clicklog WHERE clicked_at >= ? GROUP BY day ORDER BY day`, since)

	type sourceRow struct {
		Source string `db:"source"`
		Clicks int    `db:"clicks"`
	}
	var bySource []sourceRow
	_ = s.db.Select(&bySource, `
		SELECT p.source, COUNT(*) AS clicks FROM clicklog c
		JOIN product p ON c.product_id = p.id
		WHERE c.clicked_at >= ? GROUP BY p.source`, since)

	type topRow struct {
		ID     int64   `db:"id" json:"id"`
		Title  string  `db:"title" json:"title"`
		Source string  `db:"source" json:"source"`
		Price  float64 `db:"price" json:"price"`
		Clicks int     `db:"clicks" json:"clicks"`
	}
	var topProducts []topRow
	_ = s.db.Select(&topProducts, `
		SELECT p.id, p.title, p.source, p.price, COUNT(*) AS clicks
		FROM clicklog c JOIN product p ON c.product_id = p.id
		WHERE c.clicked_at >= ? GROUP BY p.id ORDER BY clicks DESC LIMIT 10`, since)

	var catalogTotal, catalogNew, variantsTotal, messagesSent int64
	_ = s.db.Get(&catalogTotal, `SELECT COUNT(*) FROM catalogproduct`)
	_ = s.db.Get(&catalogNew, `SELECT COUNT(*) FROM catalogproduct WHERE created_at >= ?`, since)
	_ = s.db.Get(&variantsTotal, `SELECT COUNT(*) FROM catalogvariant`)
	_ = s.db.Get(&messagesSent, `SELECT COUNT(*) FROM sentmessagev2 WHERE sent_at >= ?`, since)

	dailyOut := make([]map[string]any, 0, len(daily))
	for _, d := range daily {
		dailyOut = append(dailyOut, map[string]any{"date": d.Day, "clicks": d.Clicks})
	}
	sourceOut := make([]map[string]any, 0, len(bySource))
	for _, s := range bySource {
		sourceOut = append(sourceOut, map[string]any{"source": s.Source, "clicks": s.Clicks})
	}
	if topProducts == nil {
		topProducts = []topRow{}
	}

	return map[string]any{
		"total": total, "unique": unique, "days": days,
		"daily": dailyOut, "by_source": sourceOut, "top_products": topProducts,
		"catalog_total": catalogTotal, "catalog_new": catalogNew,
		"variants_total": variantsTotal, "messages_sent": messagesSent,
	}, nil
}

// Garante que AppConfig existe com id=1
func (s *SQLStore) ensureConfig() error {
	_, err := s.db.Exec(`INSERT OR IGNORE INTO appconfig (id) VALUES (1)`)
	return err
}

// Valida slug (só alfanumérico + hífen)
func ValidSlug(slug string) error {
	for _, c := range slug {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-') {
			return fmt.Errorf("slug inválido: só letras minúsculas, dígitos e hífen")
		}
	}
	return nil
}
