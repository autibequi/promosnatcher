import asyncio, sys, logging
logging.basicConfig(level=logging.WARNING)
sys.path.insert(0, '.')
from app.services.amazon import search

async def main():
    print("Testando Amazon scraper...")
    results = await search('whey protein', 50, 300)
    print(f"Resultados: {len(results)}")
    for r in results[:5]:
        print(f"  R${r['price']:.2f} | {r['title'][:55]}")
    if not results:
        print("VAZIO")

asyncio.run(main())
