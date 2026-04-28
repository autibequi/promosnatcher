"""Benchmark: compara drivers Amazon (crawl4ai vs curl_cffi).

Uso:
    cd backend && python scripts/bench_amazon_drivers.py "whey protein" 50 300
"""
import asyncio
import sys
import time
import tracemalloc

from app.services.amazon import set_driver
from app.services.amazon.drivers.crawl4ai_driver import Crawl4aiDriver
from app.services.amazon.drivers.curl_cffi_driver import CurlCffiDriver


async def bench(driver, query, min_v, max_v):
    tracemalloc.start()
    t0 = time.perf_counter()
    try:
        results = await driver.search(query, min_v, max_v)
        ok = True
        err = None
    except Exception as e:
        results, ok, err = [], False, str(e)
    elapsed = time.perf_counter() - t0
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return {
        "driver": driver.name,
        "ok": ok,
        "err": err,
        "count": len(results),
        "elapsed_s": round(elapsed, 2),
        "peak_mb": round(peak / 1024 / 1024, 1),
        "sample": [(r["title"][:50], r["price"]) for r in results[:3]],
    }


async def main(query, min_v, max_v):
    print(f"\nQuery: {query!r}  range: R$ {min_v}-{max_v}\n")
    for drv_cls in [CurlCffiDriver, Crawl4aiDriver]:
        drv = drv_cls()
        set_driver(drv)
        r = await bench(drv, query, min_v, max_v)
        print(f"[{r['driver']:10}] ok={r['ok']} count={r['count']:>2} "
              f"time={r['elapsed_s']:>5}s peak={r['peak_mb']:>5}MB"
              + (f" err={r['err']}" if r['err'] else ""))
        for title, price in r["sample"]:
            print(f"             → {price:>8.2f}  {title}")
    print()


if __name__ == "__main__":
    q = sys.argv[1] if len(sys.argv) > 1 else "whey protein"
    lo = float(sys.argv[2]) if len(sys.argv) > 2 else 50
    hi = float(sys.argv[3]) if len(sys.argv) > 3 else 300
    asyncio.run(main(q, lo, hi))
