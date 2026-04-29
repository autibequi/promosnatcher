package scrapers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"snatcher/backendv2/internal/pipeline"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
)

const mlBaseURL = "https://lista.mercadolivre.com.br"

type MLScraper struct {
	client       *http.Client
	clientID     string
	clientSecret string
	tokenMu      sync.Mutex
	token        string
	tokenExpiry  time.Time
}

func NewMLScraper(clientID, clientSecret string) *MLScraper {
	return &MLScraper{
		client:       &http.Client{Timeout: 20 * time.Second},
		clientID:     clientID,
		clientSecret: clientSecret,
	}
}

func (s *MLScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]pipeline.Item, error) {
	if s.clientID != "" && s.clientSecret != "" {
		items, err := s.searchAPI(ctx, query, minVal, maxVal)
		if err == nil {
			return items, nil
		}
	}
	return s.searchHTML(ctx, query, minVal, maxVal)
}

func (s *MLScraper) Provider() string { return "mercadolivre" }

// searchAPI usa a API oficial do ML com OAuth2 client_credentials.
func (s *MLScraper) searchAPI(ctx context.Context, query string, minVal, maxVal float64) ([]pipeline.Item, error) {
	token, err := s.getToken(ctx)
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf(
		"https://api.mercadolibre.com/sites/MLB/search?q=%s&price=%g-%g&limit=20",
		url.QueryEscape(query), minVal, maxVal,
	)
	req, _ := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("ml api status %d", resp.StatusCode)
	}

	var body struct {
		Results []struct {
			Title     string `json:"title"`
			Price     float64 `json:"price"`
			Permalink string `json:"permalink"`
			Thumbnail string `json:"thumbnail"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}

	out := make([]pipeline.Item, 0, len(body.Results))
	for _, r := range body.Results {
		if r.Price < minVal || r.Price > maxVal {
			continue
		}
		out = append(out, pipeline.Item{
			Title:    r.Title,
			Price:    r.Price,
			URL:      r.Permalink,
			ImageURL: r.Thumbnail,
			Source:   "mercadolivre",
		})
	}
	return out, nil
}

func (s *MLScraper) getToken(ctx context.Context) (string, error) {
	s.tokenMu.Lock()
	defer s.tokenMu.Unlock()
	if time.Now().Before(s.tokenExpiry) && s.token != "" {
		return s.token, nil
	}

	body := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {s.clientID},
		"client_secret": {s.clientSecret},
	}
	req, _ := http.NewRequestWithContext(ctx, "POST",
		"https://api.mercadolibre.com/oauth/token",
		strings.NewReader(body.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", err
	}
	s.token = tok.AccessToken
	s.tokenExpiry = time.Now().Add(time.Duration(tok.ExpiresIn-60) * time.Second)
	return s.token, nil
}

// searchHTML usa scraping da página de listagem como fallback.
func (s *MLScraper) searchHTML(ctx context.Context, query string, minVal, maxVal float64) ([]pipeline.Item, error) {
	searchURL := fmt.Sprintf("%s/%s", mlBaseURL, url.PathEscape(query))
	req, _ := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36")
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("ml html status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}

	var items []pipeline.Item
	doc.Find(".ui-search-result__wrapper").Each(func(_ int, sel *goquery.Selection) {
		title := strings.TrimSpace(sel.Find(".ui-search-item__title").Text())
		priceText := strings.TrimSpace(sel.Find(".andes-money-amount__fraction").First().Text())
		priceText = strings.ReplaceAll(priceText, ".", "")
		priceText = strings.ReplaceAll(priceText, ",", ".")
		price, _ := strconv.ParseFloat(priceText, 64)
		link, _ := sel.Find("a.ui-search-link").First().Attr("href")
		img, _ := sel.Find("img.ui-search-result-image__element").First().Attr("data-src")
		if img == "" {
			img, _ = sel.Find("img.ui-search-result-image__element").First().Attr("src")
		}

		if title == "" || price == 0 || link == "" {
			return
		}
		if price < minVal || price > maxVal {
			return
		}
		// Limpa parâmetros de tracking do link
		if u, err := url.Parse(link); err == nil {
			u.RawQuery = ""
			link = u.String()
		}
		items = append(items, pipeline.Item{
			Title:    title,
			Price:    price,
			URL:      link,
			ImageURL: img,
			Source:   "mercadolivre",
		})
	})
	return items, nil
}

// readAll é helper para leitura de body (não usado mas mantido para referência)
func readAll(r io.Reader) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r, 2<<20))
}
