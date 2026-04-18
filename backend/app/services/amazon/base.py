from typing import Protocol


class AmazonDriver(Protocol):
    """Contrato de um driver de scraping Amazon.

    Implementações devem retornar lista de dicts com keys:
    title, price, url, image_url, source.
    """

    name: str

    async def fetch_html(self, url: str) -> str | None: ...

    async def search(self, query: str, min_val: float, max_val: float) -> list[dict]: ...
