package pipeline

import (
	"context"
	"database/sql"
	"log/slog"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"strings"
)

const fuzzyThreshold = 0.80

// ProcessCrawlResults normaliza CrawlResults não processados e os associa ao catálogo.
func ProcessCrawlResults(ctx context.Context, st store.Store) error {
	results, err := st.ListUnprocessedCrawlResults()
	if err != nil {
		return err
	}
	if len(results) == 0 {
		return nil
	}

	keywords, _ := st.ListGroupingKeywords()

	// Carrega todos os produtos do catálogo para fuzzy match
	products, err := st.ListCatalogProducts(10000, 0)
	if err != nil {
		return err
	}

	for _, r := range results {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := processResult(ctx, st, r, products, keywords); err != nil {
			slog.Error("process result", "id", r.ID, "err", err)
		}
	}
	return nil
}

func processResult(
	_ context.Context,
	st store.Store,
	r models.CrawlResult,
	products []models.CatalogProduct,
	keywords []models.GroupingKeyword,
) error {
	// Verifica se já existe por URL
	existing, found, err := st.GetVariantByURL(r.URL)
	if err != nil {
		return err
	}
	if found {
		// URL já no catálogo — atualiza preço se mudou
		if existing.Price != r.Price {
			existing.Price = r.Price
			_ = st.UpdateCatalogVariant(existing)
			_ = st.InsertPriceHistoryV2(models.PriceHistoryV2{
				VariantID: existing.ID,
				Price:     r.Price,
			})
			// Atualiza lowest_price no produto pai
			updateLowestPrice(st, existing.CatalogProductID)
		}
		return st.MarkCrawlResultProcessed(r.ID, existing.ID)
	}

	// Nova URL — normalizar e buscar produto matching
	canonical := NormalizeTitle(r.Title)
	weight := ExtractWeight(r.Title)
	variantLabel := ExtractVariantLabel(r.Title)

	var matchedProduct *models.CatalogProduct
	for i := range products {
		if FuzzyMatch(canonical, products[i].CanonicalName, fuzzyThreshold) {
			matchedProduct = &products[i]
			break
		}
	}

	var productID int64
	if matchedProduct != nil {
		productID = matchedProduct.ID
	} else {
		// Cria novo produto canônico
		p := models.CatalogProduct{
			CanonicalName: canonical,
			Tags:          "[]",
		}
		if weight != "" {
			p.Weight = models.NullString{NullString: sql.NullString{String: weight, Valid: true}}
		}
		if r.ImageURL.Valid {
			p.ImageURL = r.ImageURL
		}
		newID, err := st.CreateCatalogProduct(p)
		if err != nil {
			return err
		}
		productID = newID
		p.ID = newID
		products = append(products, p)
		matchedProduct = &products[len(products)-1]
	}

	// Aplica grouping keywords
	refreshedProduct, _ := st.GetCatalogProduct(productID)
	applyKeywords(st, &refreshedProduct, r.Title, keywords)

	// Cria variante
	v := models.CatalogVariant{
		CatalogProductID: productID,
		Title:            r.Title,
		Price:            r.Price,
		URL:              r.URL,
		ImageURL:         r.ImageURL,
		Source:           r.Source,
	}
	if variantLabel != "" {
		v.VariantLabel = models.NullString{NullString: sql.NullString{String: variantLabel, Valid: true}}
	}
	variantID, err := st.CreateCatalogVariant(v)
	if err != nil {
		return err
	}

	// Histórico de preço inicial
	_ = st.InsertPriceHistoryV2(models.PriceHistoryV2{
		VariantID: variantID,
		Price:     r.Price,
	})

	// Atualiza lowest_price
	updateLowestPrice(st, productID)

	return st.MarkCrawlResultProcessed(r.ID, variantID)
}

func applyKeywords(st store.Store, p *models.CatalogProduct, title string, keywords []models.GroupingKeyword) {
	titleLower := strings.ToLower(title)
	changed := false
	for _, kw := range keywords {
		if !kw.Active {
			continue
		}
		if strings.Contains(titleLower, strings.ToLower(kw.Keyword)) {
			existing := p.GetTags()
			found := false
			for _, t := range existing {
				if t == kw.Tag {
					found = true
					break
				}
			}
			if !found {
				p.AddTag(kw.Tag)
				changed = true
			}
		}
	}
	if changed {
		_ = st.UpdateCatalogProduct(*p)
	}
}

func updateLowestPrice(st store.Store, productID int64) {
	variants, err := st.ListVariantsByProduct(productID)
	if err != nil || len(variants) == 0 {
		return
	}

	p, err := st.GetCatalogProduct(productID)
	if err != nil {
		return
	}

	lowest := variants[0]
	for _, v := range variants[1:] {
		if v.Price < lowest.Price {
			lowest = v
		}
	}

	p.LowestPrice = models.NullFloat64{NullFloat64: sql.NullFloat64{Float64: lowest.Price, Valid: true}}
	p.LowestPriceURL = models.NullString{NullString: sql.NullString{String: lowest.URL, Valid: true}}
	p.LowestPriceSource = models.NullString{NullString: sql.NullString{String: lowest.Source, Valid: true}}
	if !p.ImageURL.Valid && lowest.ImageURL.Valid {
		p.ImageURL = lowest.ImageURL
	}

	_ = st.UpdateCatalogProduct(p)
}
