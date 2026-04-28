from pathlib import Path
from app.services.mercadolivre import _parse

FIXTURE = Path(__file__).parent / "fixtures/ml_search.html"


def test_parse_returns_results():
    results = _parse(FIXTURE.read_text(), min_val=100, max_val=500)
    assert len(results) >= 1


def test_parse_price_filter_excludes_out_of_range():
    results = _parse(FIXTURE.read_text(), min_val=100, max_val=500)
    for r in results:
        assert 100 <= r["price"] <= 500


def test_parse_price_filter_wide_range():
    """Com range amplo, retorna mais produtos."""
    narrow = _parse(FIXTURE.read_text(), min_val=100, max_val=500)
    wide = _parse(FIXTURE.read_text(), min_val=0, max_val=9999)
    assert len(wide) >= len(narrow)


def test_parse_required_fields():
    results = _parse(FIXTURE.read_text(), min_val=0, max_val=9999)
    assert results, "Deve retornar ao menos um resultado"
    for r in results:
        assert r["title"], "título não pode ser vazio"
        assert r["price"] > 0, "preço deve ser positivo"
        assert "mercadolivre.com.br" in r["url"], "URL deve ser do ML"
        assert r["source"] == "mercadolivre"


def test_parse_image_url_prefers_data_src():
    """data-src tem prioridade sobre src (placeholder de lazy-load)."""
    results = _parse(FIXTURE.read_text(), min_val=0, max_val=9999)
    with_image = [r for r in results if r.get("image_url")]
    assert with_image, "Ao menos um resultado deve ter image_url"
    for r in with_image:
        assert "placeholder" not in r["image_url"], "Não deve retornar placeholder"


def test_parse_empty_html():
    assert _parse("", min_val=0, max_val=9999) == []


def test_parse_no_matching_cards():
    assert _parse("<html><body>sem produtos</body></html>", min_val=0, max_val=9999) == []
