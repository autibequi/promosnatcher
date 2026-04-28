from pathlib import Path
from app.services.amazon import _parse_results

FIXTURE = Path(__file__).parent / "fixtures/amazon_search.html"


def test_parse_returns_results():
    results = _parse_results(FIXTURE.read_text(), min_val=100, max_val=500)
    assert len(results) >= 1


def test_parse_price_filter_excludes_out_of_range():
    results = _parse_results(FIXTURE.read_text(), min_val=100, max_val=500)
    for r in results:
        assert 100 <= r["price"] <= 500


def test_parse_price_filter_wide_range():
    """Com range amplo, retorna mais produtos."""
    narrow = _parse_results(FIXTURE.read_text(), min_val=100, max_val=500)
    wide = _parse_results(FIXTURE.read_text(), min_val=0, max_val=9999)
    assert len(wide) >= len(narrow)


def test_parse_required_fields():
    results = _parse_results(FIXTURE.read_text(), min_val=0, max_val=9999)
    assert results, "Deve retornar ao menos um resultado"
    for r in results:
        assert r["title"], "título não pode ser vazio"
        assert r["price"] > 0, "preço deve ser positivo"
        assert "amazon.com.br" in r["url"], "URL deve ser da Amazon BR"
        assert r["source"] == "amazon"


def test_parse_image_captured():
    results = _parse_results(FIXTURE.read_text(), min_val=0, max_val=9999)
    assert any(r.get("image_url") for r in results), "Ao menos um resultado deve ter imagem"


def test_parse_url_strips_query_params():
    """URLs de produto devem terminar em /dp/ASIN sem query string."""
    results = _parse_results(FIXTURE.read_text(), min_val=0, max_val=9999)
    for r in results:
        assert "?" not in r["url"], "URL não deve conter query params"


def test_parse_empty_html():
    assert _parse_results("", min_val=0, max_val=9999) == []


def test_parse_no_matching_items():
    assert _parse_results("<html><body>sem produtos</body></html>", min_val=0, max_val=9999) == []
