import asyncio, sys
sys.path.insert(0, '.')
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from bs4 import BeautifulSoup

async def main():
    browser_cfg = BrowserConfig(
        browser_type='chromium', headless=True,
        extra_args=['--disable-blink-features=AutomationControlled','--no-sandbox','--disable-dev-shm-usage'],
    )
    run_cfg = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        page_timeout=30000,
        simulate_user=True,
        magic=True,
        delay_before_return_html=2.0,
    )
    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        result = await crawler.arun(
            url='https://www.amazon.com.br/s?k=whey+protein&rh=p_36:5000-30000&sort=price-asc-rank',
            config=run_cfg,
        )
    html = result.html or ''
    print(f"success={result.success} html={len(html)}b")
    soup = BeautifulSoup(html, 'html.parser')
    items = soup.select('[data-component-type="s-search-result"]')
    captcha = any(k in html.lower() for k in ['captcha','robot','unusual'])
    print(f"items={len(items)} captcha={captcha}")
    if items:
        item = items[0]
        title = item.select_one('h2 span') or item.select_one('.a-text-normal')
        price = item.select_one('.a-price-whole')
        link = item.select_one('a[href*="/dp/"]')
        print(f"  titulo: {title.get_text(strip=True)[:60] if title else 'NAO ENCONTRADO'}")
        print(f"  preco:  {price.get_text(strip=True) if price else 'NAO ENCONTRADO'}")
        print(f"  link:   {link.get('href','')[:60] if link else 'NAO ENCONTRADO'}")
    elif not captcha:
        # Nao tem CAPTCHA nem produtos — possivelmente Amazon nao tem resultados
        no_results = soup.select_one('.s-no-outline') or soup.select_one('[data-component-type="s-no-results"]')
        print(f"Sem resultados na pagina: {bool(no_results)}")
        print("Titulo:", soup.find('title').get_text() if soup.find('title') else '?')

asyncio.run(main())
