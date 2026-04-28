package store

import (
	"snatcher/backendv2/internal/models"
	"time"
)

// Store é a interface central de persistência.
type Store interface {
	// Config
	GetConfig() (models.AppConfig, error)
	UpdateConfig(cfg models.AppConfig) error
	ListWAAccounts() ([]models.WAAccount, error)
	GetWAAccount(id int64) (models.WAAccount, error)
	CreateWAAccount(a models.WAAccount) (int64, error)
	UpdateWAAccount(a models.WAAccount) error
	DeleteWAAccount(id int64) error
	ListTGAccounts() ([]models.TGAccount, error)
	GetTGAccount(id int64) (models.TGAccount, error)
	CreateTGAccount(a models.TGAccount) (int64, error)
	UpdateTGAccount(a models.TGAccount) error
	DeleteTGAccount(id int64) error

	// SearchTerms
	ListSearchTerms() ([]models.SearchTerm, error)
	GetSearchTerm(id int64) (models.SearchTerm, error)
	CreateSearchTerm(t models.SearchTerm) (int64, error)
	UpdateSearchTerm(t models.SearchTerm) error
	DeleteSearchTerm(id int64) error
	TouchSearchTerm(id int64, count int) error

	// CrawlResults
	InsertCrawlResult(r models.CrawlResult) (int64, error)
	ListUnprocessedCrawlResults() ([]models.CrawlResult, error)
	MarkCrawlResultProcessed(id int64, variantID int64) error
	URLAlreadyCrawled(searchTermID int64, url string) (bool, error)

	// CrawlLogs
	InsertCrawlLog(l models.CrawlLog) (int64, error)
	UpdateCrawlLog(l models.CrawlLog) error
	ListCrawlLogs(termID int64, limit int) ([]models.CrawlLog, error)

	// Catalog
	ListCatalogProducts(limit, offset int) ([]models.CatalogProduct, error)
	GetCatalogProduct(id int64) (models.CatalogProduct, error)
	CreateCatalogProduct(p models.CatalogProduct) (int64, error)
	UpdateCatalogProduct(p models.CatalogProduct) error
	DeleteCatalogProduct(id int64) error
	GetVariantByURL(url string) (models.CatalogVariant, bool, error)
	CreateCatalogVariant(v models.CatalogVariant) (int64, error)
	UpdateCatalogVariant(v models.CatalogVariant) error
	ListVariantsByProduct(productID int64) ([]models.CatalogVariant, error)
	InsertPriceHistoryV2(h models.PriceHistoryV2) error
	ListPriceHistoryV2(variantID int64) ([]models.PriceHistoryV2, error)
	ListGroupingKeywords() ([]models.GroupingKeyword, error)
	CreateGroupingKeyword(k models.GroupingKeyword) (int64, error)
	UpdateGroupingKeyword(k models.GroupingKeyword) error
	DeleteGroupingKeyword(id int64) error
	GetRecentlyUpdatedProducts(since time.Time) ([]models.CatalogProduct, error)

	// Channels
	ListChannels() ([]models.Channel, error)
	GetChannel(id int64) (models.Channel, error)
	GetChannelBySlug(slug string) (models.Channel, error)
	CreateChannel(c models.Channel) (int64, error)
	UpdateChannel(c models.Channel) error
	DeleteChannel(id int64) error
	ListChannelTargets(channelID int64) ([]models.ChannelTarget, error)
	CreateChannelTarget(t models.ChannelTarget) (int64, error)
	UpdateChannelTarget(t models.ChannelTarget) error
	DeleteChannelTarget(id int64) error
	ListChannelRules(channelID int64) ([]models.ChannelRule, error)
	CreateChannelRule(r models.ChannelRule) (int64, error)
	UpdateChannelRule(r models.ChannelRule) error
	DeleteChannelRule(id int64) error
	WasSentRecently(productID, targetID int64, since time.Time) (bool, error)
	RecordSent(s models.SentMessageV2) error

	// Broadcast
	CreateBroadcast(b models.BroadcastMessage) (int64, error)
	UpdateBroadcast(b models.BroadcastMessage) error
	ListBroadcasts(limit int) ([]models.BroadcastMessage, error)

	// Analytics
	CountClicksByProduct(productID int64) (int64, error)
	InsertClickLog(l models.ClickLog) error

	// Legacy
	ListGroups() ([]models.Group, error)
	GetGroup(id int64) (models.Group, error)
	ListProductsByGroup(groupID int64, limit int) ([]models.Product, error)
	GetProductByShortID(shortID string) (models.Product, bool, error)

	// TelegramChat
	UpsertTelegramChat(c models.TelegramChat) error
	ListTelegramChats() ([]models.TelegramChat, error)

	// Analytics
	GetAnalyticsSummary(since time.Time, days int) (map[string]any, error)
}
