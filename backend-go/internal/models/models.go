package models

import (
	"encoding/json"
	"time"
)

type Group struct {
	ID              int64          `db:"id" json:"id"`
	Name            string         `db:"name" json:"name"`
	Description     string         `db:"description" json:"description"`
	SearchPrompt    string         `db:"search_prompt" json:"search_prompt"`
	MinVal          float64        `db:"min_val" json:"min_val"`
	MaxVal          float64        `db:"max_val" json:"max_val"`
	WhatsappGroupID NullString `db:"whatsapp_group_id" json:"whatsapp_group_id,omitempty"`
	WAGroupStatus   NullString `db:"wa_group_status" json:"wa_group_status,omitempty"`
	TelegramChatID  NullString `db:"telegram_chat_id" json:"telegram_chat_id,omitempty"`
	TGGroupStatus   NullString `db:"tg_group_status" json:"tg_group_status,omitempty"`
	MessageTemplate NullString `db:"message_template" json:"message_template,omitempty"`
	Active          bool           `db:"active" json:"active"`
	ScanInterval    int            `db:"scan_interval" json:"scan_interval"`
	CreatedAt       time.Time      `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time      `db:"updated_at" json:"updated_at"`
}

type Product struct {
	ID        int64          `db:"id" json:"id"`
	GroupID   int64          `db:"group_id" json:"group_id"`
	Title     string         `db:"title" json:"title"`
	Price     float64        `db:"price" json:"price"`
	URL       string         `db:"url" json:"url"`
	ImageURL  NullString `db:"image_url" json:"image_url,omitempty"`
	Source    string         `db:"source" json:"source"`
	ShortID   NullString `db:"short_id" json:"short_id,omitempty"`
	FamilyKey NullString `db:"family_key" json:"family_key,omitempty"`
	FoundAt   time.Time      `db:"found_at" json:"found_at"`
	SentAt    NullTime   `db:"sent_at" json:"sent_at,omitempty"`
}

type ClickLog struct {
	ID        int64     `db:"id" json:"id"`
	ProductID int64     `db:"product_id" json:"product_id"`
	ClickedAt time.Time `db:"clicked_at" json:"clicked_at"`
	IPHash    string    `db:"ip_hash" json:"ip_hash"`
	UserAgent string    `db:"user_agent" json:"user_agent"`
	Referrer  string    `db:"referrer" json:"referrer"`
}

type ScanJob struct {
	ID            int64          `db:"id" json:"id"`
	GroupID       int64          `db:"group_id" json:"group_id"`
	StartedAt     time.Time      `db:"started_at" json:"started_at"`
	FinishedAt    NullTime   `db:"finished_at" json:"finished_at,omitempty"`
	ProductsFound int            `db:"products_found" json:"products_found"`
	Status        string         `db:"status" json:"status"`
	ErrorMsg      NullString `db:"error_msg" json:"error_msg,omitempty"`
}

type AppConfig struct {
	ID                int            `db:"id" json:"id"`
	WAProvider        string         `db:"wa_provider" json:"wa_provider"`
	WABaseURL         NullString `db:"wa_base_url" json:"wa_base_url,omitempty"`
	WAApiKey          NullString `db:"wa_api_key" json:"wa_api_key,omitempty"`
	WAInstance        NullString `db:"wa_instance" json:"wa_instance,omitempty"`
	GlobalInterval    int            `db:"global_interval" json:"global_interval"`
	SendStartHour     int            `db:"send_start_hour" json:"send_start_hour"`
	SendEndHour       int            `db:"send_end_hour" json:"send_end_hour"`
	MLClientID        NullString `db:"ml_client_id" json:"ml_client_id,omitempty"`
	MLClientSecret    NullString `db:"ml_client_secret" json:"ml_client_secret,omitempty"`
	WAGroupPrefix     NullString `db:"wa_group_prefix" json:"wa_group_prefix,omitempty"`
	AmzTrackingID     NullString `db:"amz_tracking_id" json:"amz_tracking_id,omitempty"`
	MLAffiliateToolID NullString `db:"ml_affiliate_tool_id" json:"ml_affiliate_tool_id,omitempty"`
	AlertPhone        NullString `db:"alert_phone" json:"alert_phone,omitempty"`
	UseShortLinks     bool           `db:"use_short_links" json:"use_short_links"`
	TGEnabled         bool           `db:"tg_enabled" json:"tg_enabled"`
	TGBotToken        NullString `db:"tg_bot_token" json:"tg_bot_token,omitempty"`
	TGBotUsername     NullString `db:"tg_bot_username" json:"tg_bot_username,omitempty"`
	TGGroupPrefix     NullString `db:"tg_group_prefix" json:"tg_group_prefix,omitempty"`
	TGLastUpdateID    NullInt64  `db:"tg_last_update_id" json:"tg_last_update_id,omitempty"`
}

type WAAccount struct {
	ID          int64          `db:"id" json:"id"`
	Name        string         `db:"name" json:"name"`
	Provider    string         `db:"provider" json:"provider"`
	BaseURL     NullString `db:"base_url" json:"base_url,omitempty"`
	APIKey      NullString `db:"api_key" json:"api_key,omitempty"`
	Instance    NullString `db:"instance" json:"instance,omitempty"`
	GroupPrefix NullString `db:"group_prefix" json:"group_prefix,omitempty"`
	Status      string         `db:"status" json:"status"`
	Active      bool           `db:"active" json:"active"`
	CreatedAt   time.Time      `db:"created_at" json:"created_at"`
}

type TGAccount struct {
	ID           int64          `db:"id" json:"id"`
	Name         string         `db:"name" json:"name"`
	BotToken     NullString `db:"bot_token" json:"bot_token,omitempty"`
	BotUsername  NullString `db:"bot_username" json:"bot_username,omitempty"`
	GroupPrefix  NullString `db:"group_prefix" json:"group_prefix,omitempty"`
	LastUpdateID NullInt64  `db:"last_update_id" json:"last_update_id,omitempty"`
	Active       bool           `db:"active" json:"active"`
	CreatedAt    time.Time      `db:"created_at" json:"created_at"`
}

type SearchTerm struct {
	ID                int64          `db:"id" json:"id"`
	Query             string         `db:"query" json:"query"`
	Queries           string         `db:"queries" json:"queries"`
	MinVal            float64        `db:"min_val" json:"min_val"`
	MaxVal            float64        `db:"max_val" json:"max_val"`
	Sources           string         `db:"sources" json:"sources"`
	Active            bool           `db:"active" json:"active"`
	CrawlInterval     int            `db:"crawl_interval" json:"crawl_interval"`
	LastCrawledAt     NullTime   `db:"last_crawled_at" json:"last_crawled_at,omitempty"`
	ResultCount       int            `db:"result_count" json:"result_count"`
	CreatedAt         time.Time      `db:"created_at" json:"created_at"`
	MLAffiliateToolID NullString `db:"ml_affiliate_tool_id" json:"ml_affiliate_tool_id,omitempty"`
	AmzTrackingID     NullString `db:"amz_tracking_id" json:"amz_tracking_id,omitempty"`
}

func (s *SearchTerm) GetQueries() []string {
	var extra []string
	_ = json.Unmarshal([]byte(s.Queries), &extra)
	seen := map[string]bool{s.Query: true}
	out := []string{s.Query}
	for _, q := range extra {
		if q != "" && !seen[q] {
			seen[q] = true
			out = append(out, q)
		}
	}
	return out
}

type CrawlResult struct {
	ID               int64          `db:"id" json:"id"`
	SearchTermID     int64          `db:"search_term_id" json:"search_term_id"`
	Title            string         `db:"title" json:"title"`
	Price            float64        `db:"price" json:"price"`
	URL              string         `db:"url" json:"url"`
	ImageURL         NullString `db:"image_url" json:"image_url,omitempty"`
	Source           string         `db:"source" json:"source"`
	CrawledAt        time.Time      `db:"crawled_at" json:"crawled_at"`
	CatalogVariantID NullInt64  `db:"catalog_variant_id" json:"catalog_variant_id,omitempty"`
}

type CatalogProduct struct {
	ID                int64           `db:"id" json:"id"`
	CanonicalName     string          `db:"canonical_name" json:"canonical_name"`
	Brand             NullString  `db:"brand" json:"brand,omitempty"`
	Weight            NullString  `db:"weight" json:"weight,omitempty"`
	ImageURL          NullString  `db:"image_url" json:"image_url,omitempty"`
	LowestPrice       NullFloat64 `db:"lowest_price" json:"lowest_price,omitempty"`
	LowestPriceURL    NullString  `db:"lowest_price_url" json:"lowest_price_url,omitempty"`
	LowestPriceSource NullString  `db:"lowest_price_source" json:"lowest_price_source,omitempty"`
	Tags              string          `db:"tags" json:"tags"`
	CreatedAt         time.Time       `db:"created_at" json:"created_at"`
	UpdatedAt         time.Time       `db:"updated_at" json:"updated_at"`
}

func (p *CatalogProduct) GetTags() []string {
	var tags []string
	_ = json.Unmarshal([]byte(p.Tags), &tags)
	return tags
}

func (p *CatalogProduct) SetTags(tags []string) {
	b, _ := json.Marshal(tags)
	p.Tags = string(b)
}

func (p *CatalogProduct) AddTag(tag string) {
	tags := p.GetTags()
	for _, t := range tags {
		if t == tag {
			return
		}
	}
	p.SetTags(append(tags, tag))
}

type CatalogVariant struct {
	ID               int64          `db:"id" json:"id"`
	CatalogProductID int64          `db:"catalog_product_id" json:"catalog_product_id"`
	Title            string         `db:"title" json:"title"`
	VariantLabel     NullString `db:"variant_label" json:"variant_label,omitempty"`
	Price            float64        `db:"price" json:"price"`
	URL              string         `db:"url" json:"url"`
	ImageURL         NullString `db:"image_url" json:"image_url,omitempty"`
	Source           string         `db:"source" json:"source"`
	FirstSeenAt      time.Time      `db:"first_seen_at" json:"first_seen_at"`
	LastSeenAt       time.Time      `db:"last_seen_at" json:"last_seen_at"`
}

type PriceHistoryV2 struct {
	ID         int64     `db:"id" json:"id"`
	VariantID  int64     `db:"variant_id" json:"variant_id"`
	Price      float64   `db:"price" json:"price"`
	RecordedAt time.Time `db:"recorded_at" json:"recorded_at"`
}

type GroupingKeyword struct {
	ID      int64  `db:"id" json:"id"`
	Keyword string `db:"keyword" json:"keyword"`
	Tag     string `db:"tag" json:"tag"`
	Active  bool   `db:"active" json:"active"`
}

type Channel struct {
	ID              int64          `db:"id" json:"id"`
	Name            string         `db:"name" json:"name"`
	Description     string         `db:"description" json:"description"`
	Slug            NullString `db:"slug" json:"slug,omitempty"`
	MessageTemplate NullString `db:"message_template" json:"message_template,omitempty"`
	SendStartHour   int            `db:"send_start_hour" json:"send_start_hour"`
	SendEndHour     int            `db:"send_end_hour" json:"send_end_hour"`
	DigestMode      bool           `db:"digest_mode" json:"digest_mode"`
	DigestMaxItems  int            `db:"digest_max_items" json:"digest_max_items"`
	Active          bool           `db:"active" json:"active"`
	CreatedAt       time.Time      `db:"created_at" json:"created_at"`
}

type ChannelTarget struct {
	ID        int64          `db:"id" json:"id"`
	ChannelID int64          `db:"channel_id" json:"channel_id"`
	Provider  string         `db:"provider" json:"provider"`
	ChatID    string         `db:"chat_id" json:"chat_id"`
	Name      NullString `db:"name" json:"name,omitempty"`
	InviteURL NullString `db:"invite_url" json:"invite_url,omitempty"`
	Status    string         `db:"status" json:"status"`
}

type ChannelRule struct {
	ID            int64           `db:"id" json:"id"`
	ChannelID     int64           `db:"channel_id" json:"channel_id"`
	MatchType     string          `db:"match_type" json:"match_type"`
	MatchValue    NullString  `db:"match_value" json:"match_value,omitempty"`
	MaxPrice      NullFloat64 `db:"max_price" json:"max_price,omitempty"`
	NotifyNew     bool            `db:"notify_new" json:"notify_new"`
	NotifyDrop    bool            `db:"notify_drop" json:"notify_drop"`
	NotifyLowest  bool            `db:"notify_lowest" json:"notify_lowest"`
	DropThreshold float64         `db:"drop_threshold" json:"drop_threshold"`
	Active        bool            `db:"active" json:"active"`
}

type SentMessageV2 struct {
	ID               int64     `db:"id" json:"id"`
	CatalogProductID int64     `db:"catalog_product_id" json:"catalog_product_id"`
	ChannelTargetID  int64     `db:"channel_target_id" json:"channel_target_id"`
	IsDrop           bool      `db:"is_drop" json:"is_drop"`
	SentAt           time.Time `db:"sent_at" json:"sent_at"`
}

type CrawlLog struct {
	ID           int64          `db:"id" json:"id"`
	SearchTermID int64          `db:"search_term_id" json:"search_term_id"`
	StartedAt    time.Time      `db:"started_at" json:"started_at"`
	FinishedAt   NullTime   `db:"finished_at" json:"finished_at,omitempty"`
	Status       string         `db:"status" json:"status"`
	MLCount      int            `db:"ml_count" json:"ml_count"`
	AmzCount     int            `db:"amz_count" json:"amz_count"`
	ErrorMsg     NullString `db:"error_msg" json:"error_msg,omitempty"`
}

type BroadcastMessage struct {
	ID         int64          `db:"id" json:"id"`
	Text       string         `db:"text" json:"text"`
	ImageURL   NullString `db:"image_url" json:"image_url,omitempty"`
	ChannelIDs string         `db:"channel_ids" json:"channel_ids"`
	Status     string         `db:"status" json:"status"`
	SentCount  int            `db:"sent_count" json:"sent_count"`
	SentAt     NullTime   `db:"sent_at" json:"sent_at,omitempty"`
	ErrorMsg   NullString `db:"error_msg" json:"error_msg,omitempty"`
	CreatedAt  time.Time      `db:"created_at" json:"created_at"`
}

type TelegramChat struct {
	ChatID          string         `db:"chat_id" json:"chat_id"`
	Type            string         `db:"type" json:"type"`
	Title           string         `db:"title" json:"title"`
	Username        NullString `db:"username" json:"username,omitempty"`
	MemberCount     NullInt64  `db:"member_count" json:"member_count,omitempty"`
	IsAdmin         bool           `db:"is_admin" json:"is_admin"`
	DiscoveredAt    time.Time      `db:"discovered_at" json:"discovered_at"`
	LastSeenAt      time.Time      `db:"last_seen_at" json:"last_seen_at"`
	LinkedGroupID   NullInt64  `db:"linked_group_id" json:"linked_group_id,omitempty"`
	LinkedChannelID NullInt64  `db:"linked_channel_id" json:"linked_channel_id,omitempty"`
}
