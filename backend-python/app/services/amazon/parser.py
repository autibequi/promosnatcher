from urllib.parse import urlencode, urlparse, urlunparse
from bs4 import BeautifulSoup


def make_affiliate_url(url: str, tracking_id: str) -> str:
    p = urlparse(url)
    return urlunparse(p._replace(query=urlencode({"tag": tracking_id}), fragment=""))


def build_url(query: str, min_val: float, max_val: float) -> str:
    params = urlencode({
        "k": query,
        "rh": f"p_36:{int(min_val * 100)}-{int(max_val * 100)}",
        "sort": "price-asc-rank",
    })
    return f"https://www.amazon.com.br/s?{params}"


def parse_results(html: str, min_val: float, max_val: float) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    items = soup.select('[data-component-type="s-search-result"]')
    results = []

    for item in items[:20]:
        title_el = item.select_one("h2 span") or item.select_one(".a-text-normal")
        price_whole = item.select_one(".a-price-whole")
        price_frac = item.select_one(".a-price-fraction")
        link_el = item.select_one('a[href*="/dp/"]')
        img_el = item.select_one(".s-image")

        if not title_el or not price_whole or not link_el:
            continue

        try:
            price_str = (
                price_whole.get_text(strip=True)
                .replace(".", "")
                .replace(",", "")
                .rstrip(".")
            )
            frac_str = (
                price_frac.get_text(strip=True) if price_frac else "00"
            ).replace(",", "")
            price = float(f"{price_str}.{frac_str}")
        except ValueError:
            continue

        if not (min_val <= price <= max_val):
            continue

        href = link_el.get("href", "")
        product_url = (
            f"https://www.amazon.com.br{href}" if href.startswith("/") else href
        )

        results.append({
            "title": title_el.get_text(strip=True),
            "price": price,
            "url": product_url.split("?")[0],
            "image_url": img_el.get("src") if img_el else None,
            "source": "amazon",
        })

    return results
