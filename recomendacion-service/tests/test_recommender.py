"""Tests unitarios puros para la lógica de scoring de recomendaciones."""
import pytest

from app.models.schemas import GasolineraInternal
from app.services.recommendation_core import CandidateScore, score_candidates


# ── helpers ───────────────────────────────────────────────────────────────────

def _station(precio: float, lat: float = 40.5, lon: float = -3.5) -> GasolineraInternal:
    return GasolineraInternal(lat=lat, lon=lon, precio=precio, nombre="Test")


def _candidate(station: GasolineraInternal, desvio_km: float = 1.0) -> CandidateScore:
    return CandidateScore(
        station=station,
        precio=station.precio,
        desvio_km=desvio_km,
        desvio_min=round(desvio_km * 60.0 / 80.0, 1),
        detour_source="approx",
        service_area_bonus=0.0,
        fraction=0.5,
        pct=50.0,
        dist_from_origin=50.0,
    )


def _make_candidates(precios: list[float], desvios: list[float] | None = None) -> list[CandidateScore]:
    if desvios is None:
        desvios = [1.0] * len(precios)
    return [_candidate(_station(p), d) for p, d in zip(precios, desvios)]


# ── scoring ───────────────────────────────────────────────────────────────────

def test_scoring_prioriza_precio_bajo():
    """Con peso_precio=1.0 y peso_desvio=0.0, la estación más barata debe tener el score más alto."""
    candidates = _make_candidates([1.699, 1.399, 1.549])
    scored = score_candidates(candidates, peso_precio=1.0, peso_desvio=0.0)

    # El primero en la lista ordenada debe ser el de precio 1.399
    assert scored[0].precio == pytest.approx(1.399)
    assert scored[0].score > scored[-1].score


def test_scoring_prioriza_desvio_minimo():
    """Con peso_desvio=1.0 y peso_precio=0.0, la estación con menor desvío debe ganar."""
    # Mismo precio, desvíos distintos
    candidates = _make_candidates(
        precios=[1.5, 1.5, 1.5],
        desvios=[5.0, 0.5, 2.0],
    )
    scored = score_candidates(candidates, peso_precio=0.0, peso_desvio=1.0)

    # desvio 0.5 km debe estar primero
    assert scored[0].desvio_km == pytest.approx(0.5)
    assert scored[0].score > scored[-1].score


def test_ahorro_calculado_correctamente():
    """(precio_max - precio_min) * litros_deposito debe igualar el ahorro esperado."""
    precios = [1.399, 1.499, 1.599]
    litros_deposito = 50.0

    candidates = _make_candidates(precios)
    scored = score_candidates(candidates, peso_precio=1.0, peso_desvio=0.0)

    precio_min = scored[0].precio
    precio_max = max(c.precio for c in scored)
    ahorro = (precio_max - precio_min) * litros_deposito

    assert ahorro == pytest.approx(10.0, abs=0.001)


def test_top_n_limita_resultados():
    """Aplicar top_n=3 sobre la lista ordenada devuelve exactamente 3 estaciones."""
    candidates = _make_candidates([1.3, 1.4, 1.5, 1.6, 1.7])
    scored = score_candidates(candidates, peso_precio=0.6, peso_desvio=0.4)

    top_n = 3
    result = scored[:top_n]

    assert len(result) == top_n
    assert len(scored) == 5  # la lista original no se trunca
    # El resultado está ordenado de mayor a menor score
    assert result[0].score >= result[-1].score


def test_score_lista_vacia():
    """score_candidates con lista vacía devuelve lista vacía sin errores."""
    assert score_candidates([], peso_precio=0.6, peso_desvio=0.4) == []


def test_score_un_unico_candidato():
    """Con un solo candidato todos los valores normalizados son 0.5, score válido."""
    candidates = _make_candidates([1.5])
    scored = score_candidates(candidates, peso_precio=0.6, peso_desvio=0.4)
    assert len(scored) == 1
    # normalize_values con un solo valor devuelve 0.5
    assert 0.0 <= scored[0].score <= 1.0
