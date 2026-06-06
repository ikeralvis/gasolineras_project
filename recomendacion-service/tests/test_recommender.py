"""Tests unitarios puros para la lógica de scoring de recomendaciones."""
import pytest
from types import SimpleNamespace

from app.models.schemas import Coordenada, GasolineraInternal, RecomendacionRequest
from app.services.recommendation_core import (
    SERVICE_AREA_BONUS,
    CandidateScore,
    build_stop_option_candidates,
    filter_viable_candidates,
    infer_service_area_bonus,
    resolve_detour_budget,
    score_candidates,
    summarize_prices,
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _station(
    precio: float,
    lat: float = 40.5,
    lon: float = -3.5,
    nombre: str = "Test",
    es_area_servicio: bool = False,
    osm_highway: str | None = None,
    direccion: str | None = None,
) -> GasolineraInternal:
    return GasolineraInternal(
        lat=lat, lon=lon, precio=precio, nombre=nombre,
        es_area_servicio=es_area_servicio, osm_highway=osm_highway,
        direccion=direccion,
    )


def _candidate(station: GasolineraInternal, desvio_km: float = 1.0, fraction: float = 0.5) -> CandidateScore:
    return CandidateScore(
        station=station,
        precio=station.precio,
        desvio_km=desvio_km,
        desvio_min=round(desvio_km * 60.0 / 80.0, 1),
        detour_source="approx",
        service_area_bonus=0.0,
        fraction=fraction,
        pct=fraction * 100.0,
        dist_from_origin=fraction * 200.0,
    )


def _make_candidates(precios: list[float], desvios: list[float] | None = None) -> list[CandidateScore]:
    if desvios is None:
        desvios = [1.0] * len(precios)
    return [_candidate(_station(p), d) for p, d in zip(precios, desvios)]


_ORIGIN = Coordenada(lat=40.4, lon=-3.7)
_DEST = Coordenada(lat=41.4, lon=2.2)


def _req(**kwargs) -> RecomendacionRequest:
    return RecomendacionRequest(origen=_ORIGIN, destino=_DEST, **kwargs)


# ── score_candidates ───────────────────────────────────────────────────────────

def test_scoring_prioriza_precio_bajo():
    """Con peso_precio=1.0 y peso_desvio=0.0, la estación más barata debe tener el score más alto."""
    candidates = _make_candidates([1.699, 1.399, 1.549])
    scored = score_candidates(candidates, peso_precio=1.0, peso_desvio=0.0)

    assert scored[0].precio == pytest.approx(1.399)
    assert scored[0].score > scored[-1].score


def test_scoring_prioriza_desvio_minimo():
    """Con peso_desvio=1.0 y peso_precio=0.0, la estación con menor desvío debe ganar."""
    candidates = _make_candidates(
        precios=[1.5, 1.5, 1.5],
        desvios=[5.0, 0.5, 2.0],
    )
    scored = score_candidates(candidates, peso_precio=0.0, peso_desvio=1.0)

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

    result = scored[:3]
    assert len(result) == 3
    assert result[0].score >= result[-1].score


def test_score_lista_vacia():
    """score_candidates con lista vacía devuelve lista vacía sin errores."""
    assert score_candidates([], peso_precio=0.6, peso_desvio=0.4) == []


def test_score_un_unico_candidato():
    """Con un solo candidato todos los valores normalizados son 0.5, score válido."""
    candidates = _make_candidates([1.5])
    scored = score_candidates(candidates, peso_precio=0.6, peso_desvio=0.4)
    assert len(scored) == 1
    assert 0.0 <= scored[0].score <= 1.0


# ── infer_service_area_bonus ──────────────────────────────────────────────────

def test_infer_bonus_es_area_servicio():
    """Gasolinera marcada como área de servicio recibe el bonus completo."""
    s = _station(1.5, es_area_servicio=True)
    assert infer_service_area_bonus(s) == pytest.approx(SERVICE_AREA_BONUS)


def test_infer_bonus_osm_services():
    """osm_highway='services' recibe el bonus completo."""
    s = _station(1.5, osm_highway="services")
    assert infer_service_area_bonus(s) == pytest.approx(SERVICE_AREA_BONUS)


def test_infer_bonus_osm_rest_area():
    """osm_highway='rest_area' recibe el bonus completo."""
    s = _station(1.5, osm_highway="rest_area")
    assert infer_service_area_bonus(s) == pytest.approx(SERVICE_AREA_BONUS)


def test_infer_bonus_nombre_texto():
    """'area de servicio' en nombre/dirección recibe el 75% del bonus."""
    s = _station(1.5, nombre="Area de Servicio Nacional A-2")
    assert infer_service_area_bonus(s) == pytest.approx(SERVICE_AREA_BONUS * 0.75)


def test_infer_bonus_gasolinera_normal():
    """Una gasolinera normal sin indicios de área de servicio recibe bonus 0."""
    s = _station(1.5, nombre="REPSOL", direccion="Calle Mayor 1")
    assert infer_service_area_bonus(s) == pytest.approx(0.0)


# ── resolve_detour_budget ─────────────────────────────────────────────────────

def test_resolve_detour_con_max_desvio_min():
    """Si max_desvio_min está definido en el request se usa en vez del default."""
    req = _req(max_desvio_min=10.0, max_desvio_km=5.0)
    detour_min, _, _ = resolve_detour_budget(req, default_minutes=20.0, avg_speed_kmh=80.0)
    assert detour_min == pytest.approx(10.0)


def test_resolve_detour_sin_max_desvio_min_usa_default():
    """Si max_desvio_min es None se usa el default_minutes."""
    req = _req(max_desvio_km=5.0)  # max_desvio_min no pasado → None
    detour_min, _, _ = resolve_detour_budget(req, default_minutes=15.0, avg_speed_kmh=80.0)
    assert detour_min == pytest.approx(15.0)


def test_resolve_detour_km_es_max_de_request_y_tiempo():
    """detour_limit_km debe ser al menos max_desvio_km del request."""
    req = _req(max_desvio_km=20.0, max_desvio_min=5.0)
    _, detour_km, _ = resolve_detour_budget(req, default_minutes=5.0, avg_speed_kmh=80.0)
    # 5 min a 80 km/h = 6.67 km, pero max_desvio_km=20 → límite debe ser al menos 20
    assert detour_km >= 20.0


def test_resolve_prefilter_buffer_nunca_menor_que_12():
    """prefilter_buffer_km debe tener un mínimo de 12 km."""
    req = _req(max_desvio_km=1.0, max_desvio_min=1.0)
    _, _, prefilter = resolve_detour_budget(req, default_minutes=1.0, avg_speed_kmh=80.0)
    assert prefilter >= 12.0


def test_resolve_prefilter_buffer_nunca_mayor_que_80():
    """prefilter_buffer_km debe tener un máximo de 80 km."""
    req = _req(max_desvio_km=50.0, max_desvio_min=120.0)
    _, _, prefilter = resolve_detour_budget(req, default_minutes=120.0, avg_speed_kmh=120.0)
    assert prefilter <= 80.0


# ── filter_viable_candidates ──────────────────────────────────────────────────

def test_filter_excluye_por_fraccion_atras():
    """Candidata cuyo fraction es menor que current_progress debe ser descartada."""
    c = _candidate(_station(1.5), fraction=0.1)
    result = filter_viable_candidates(
        [c], current_progress=0.5, detour_limit_min=30.0, detour_limit_km=10.0
    )
    assert len(result) == 0


def test_filter_excluye_por_desvio_min():
    """Candidata con desvio_min > límite debe ser descartada."""
    c = _candidate(_station(1.5), desvio_km=20.0)  # desvio_min = 20*60/80 = 15 min
    result = filter_viable_candidates(
        [c], current_progress=0.0, detour_limit_min=5.0, detour_limit_km=50.0
    )
    assert len(result) == 0


def test_filter_excluye_por_desvio_km():
    """Candidata con desvio_km > límite debe ser descartada."""
    c = _candidate(_station(1.5), desvio_km=15.0)
    result = filter_viable_candidates(
        [c], current_progress=0.0, detour_limit_min=60.0, detour_limit_km=10.0
    )
    assert len(result) == 0


def test_filter_pasa_candidata_valida():
    """Candidata dentro de todos los límites debe pasar el filtro."""
    c = _candidate(_station(1.5), desvio_km=2.0, fraction=0.5)
    result = filter_viable_candidates(
        [c], current_progress=0.3, detour_limit_min=30.0, detour_limit_km=5.0
    )
    assert len(result) == 1


# ── summarize_prices ──────────────────────────────────────────────────────────

def test_summarize_prices_calcula_min_max_avg():
    """summarize_prices debe devolver (min, max, avg) correctos."""
    candidates = _make_candidates([1.3, 1.5, 1.7])
    min_p, max_p, avg_p = summarize_prices(candidates)

    assert min_p == pytest.approx(1.3)
    assert max_p == pytest.approx(1.7)
    assert avg_p == pytest.approx(1.5, abs=0.001)


def test_summarize_prices_lista_vacia():
    """summarize_prices con lista vacía devuelve (0.0, 0.0, 0.0)."""
    assert summarize_prices([]) == (0.0, 0.0, 0.0)


def test_summarize_prices_un_candidato():
    """Con un único candidato min == max == avg."""
    candidates = _make_candidates([1.459])
    min_p, max_p, avg_p = summarize_prices(candidates)
    assert min_p == max_p == pytest.approx(avg_p)


# ── build_stop_option_candidates ──────────────────────────────────────────────

def _stop(score=0.5, precio_litro=1.5, porcentaje_ruta=50.0, desvio_km=2.0, posicion=1):
    """Helper para crear objetos compatibles con build_stop_option_candidates."""
    return SimpleNamespace(
        score=score,
        precio_litro=precio_litro,
        porcentaje_ruta=porcentaje_ruta,
        desvio_km=desvio_km,
        posicion=posicion,
    )


def test_build_stop_options_lista_vacia():
    """Lista vacía → resultado vacío."""
    assert build_stop_option_candidates([]) == []


def test_build_stop_options_devuelve_hasta_4():
    """Con ≥4 candidatos con posiciones únicas devuelve hasta 4 opciones."""
    items = [
        _stop(score=0.9, precio_litro=1.3, porcentaje_ruta=45.0, desvio_km=1.0, posicion=1),
        _stop(score=0.7, precio_litro=1.2, porcentaje_ruta=70.0, desvio_km=3.0, posicion=2),
        _stop(score=0.5, precio_litro=1.6, porcentaje_ruta=50.0, desvio_km=0.5, posicion=3),
        _stop(score=0.3, precio_litro=1.8, porcentaje_ruta=20.0, desvio_km=5.0, posicion=4),
    ]
    result = build_stop_option_candidates(items)
    assert len(result) <= 4
    # No debe haber posiciones duplicadas
    posiciones = [o.posicion for o in result]
    assert len(posiciones) == len(set(posiciones))


def test_build_stop_options_deduplica_posiciones():
    """Si varias categorías apuntan al mismo candidato solo aparece una vez."""
    # Un candidato es el mejor en todo (mismo score, precio, desvío y posición ≈ 50%)
    solo = _stop(score=0.9, precio_litro=1.1, porcentaje_ruta=50.0, desvio_km=0.1, posicion=1)
    result = build_stop_option_candidates([solo])
    assert len(result) == 1
