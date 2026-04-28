"""
Normalização de títulos de produtos para agrupamento por família.

Extrai canonical key removendo: acentos, parênteses, peso, embalagem, variantes.
Mantém: marca + tipo do produto.
"""
import re
import unicodedata
from difflib import SequenceMatcher

# Sabores, cores e variantes comuns em e-commerce BR
VARIANT_WORDS = {
    "baunilha", "chocolate", "morango", "banana", "coco", "amendoim",
    "cookies", "brigadeiro", "cappuccino", "caramelo", "limao",
    "natural", "neutro", "original", "tradicional",
    "ninho", "avela", "pistache", "cafe", "menta", "laranja",
    "abacaxi", "uva", "maracuja", "baunilia",
    "preto", "branco", "azul", "vermelho", "rosa", "cinza",
    "black", "white", "blue", "red", "pink", "grey",
}

PACKAGING_WORDS = {
    "pote", "sache", "pouch", "bag", "caixa", "pct", "pacote",
    "lata", "bisnaga", "frasco", "display", "refil",
}

NOISE_WORDS = {
    "sabor", "sabores", "todos", "os", "em", "de", "da", "do",
    "e", "com", "para", "novo", "todos", "varios",
}

WEIGHT_RE = re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|lb)\b", re.IGNORECASE)

MULTI_WORD_VARIANTS = {
    "ninho c avela", "ninho com avela",
    "doce de leite", "torta de limao",
    "frutas vermelhas", "cookies cream", "cookies and cream",
    "dulce de leche", "sem sabor",
}

DEFAULT_BRANDS = [
    "integralmedica", "integralmédica", "max titanium", "growth supplements",
    "growth", "soldiers nutrition", "soldiers", "goup nutrition", "newnutrition",
    "new nutrition", "probiotica", "probiótica", "optimum nutrition", "dux nutrition",
    "darkness", "essential nutrition", "nutrify", "vitafor", "black skull",
]


def deaccent(text: str) -> str:
    """Remove acentos para normalização (Integralmédica = Integralmedica)."""
    return "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )


def is_variant_token(tok: str) -> bool:
    """Retorna True se o token é variante ou typo próximo."""
    if tok in VARIANT_WORDS:
        return True
    if len(tok) >= 5:
        for v in VARIANT_WORDS:
            if len(v) >= 4 and SequenceMatcher(None, tok, v).ratio() > 0.85:
                return True
    return False


def normalize_title(title: str) -> str:
    """Normaliza título para canonical key de agrupamento."""
    t = deaccent(title.lower().strip())
    t = re.sub(r"\([^)]*\)", "", t)
    for mv in sorted(MULTI_WORD_VARIANTS, key=len, reverse=True):
        t = t.replace(mv, " ")
    t = WEIGHT_RE.sub(" ", t)
    tokens = re.split(r"[\s\-–—/|,;.]+", t)
    keep = []
    for tok in tokens:
        tok = tok.strip()
        if not tok:
            continue
        if tok in PACKAGING_WORDS or tok in NOISE_WORDS or is_variant_token(tok):
            continue
        keep.append(tok)
    return " ".join(keep).strip()


def compute_family_key(title: str, existing_keys: dict[str, str], threshold: float = 0.80) -> str:
    """Retorna family_key: match exato → fuzzy → nova key."""
    norm = normalize_title(title)
    if not norm:
        return deaccent(title.lower().strip())[:60]
    if norm in existing_keys:
        return existing_keys[norm]
    for key_norm, fk in existing_keys.items():
        if SequenceMatcher(None, norm, key_norm).ratio() >= threshold:
            return fk
    return norm


def extract_weight(title: str) -> str | None:
    """Extrai peso/volume: '900g', '1kg', etc."""
    m = WEIGHT_RE.search(title)
    return m.group(0).strip().lower() if m else None


def extract_brand(title: str, known_brands: list[str] | None = None) -> str | None:
    """Tenta extrair marca do título."""
    brands = known_brands or DEFAULT_BRANDS
    t_lower = title.lower()
    for brand in sorted(brands, key=len, reverse=True):
        if brand in t_lower:
            return brand.title()
    return None


def extract_variant_label(title: str) -> str | None:
    """Extrai rótulo da variante (sabor/cor) do título."""
    t = deaccent(title.lower())
    tokens = re.split(r"[\s\-–—/|,;.]+", t)
    parts = [tok.title() for tok in tokens if tok and is_variant_token(tok)]
    return " ".join(parts) if parts else None
