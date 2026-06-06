"""Tests unitarios puros para funciones geométricas de geo_math.py."""
import pytest
from shapely.geometry import LineString, Point

from app.services.geo_math import (
    approx_road_detour_km,
    build_route_corridor,
    haversine_km,
    km_to_minutes,
    minutes_to_km,
    normalize_values,
    position_along_route,
)


# ── haversine ──────────────────────────────────────────────────────────────────

def test_haversine_distancia_conocida():
    """Madrid (40.4,-3.7) → Barcelona (41.38,2.17) debe ser ≈ 504 km."""
    dist = haversine_km(40.4, -3.7, 41.38, 2.17)
    assert 490.0 <= dist <= 520.0, f"Esperado ~504 km, obtenido {dist:.1f} km"


def test_haversine_misma_posicion():
    """La distancia de un punto a sí mismo debe ser exactamente 0."""
    dist = haversine_km(40.4168, -3.7038, 40.4168, -3.7038)
    assert dist == pytest.approx(0.0, abs=1e-9)


def test_haversine_simetria():
    """dist(A, B) debe ser igual a dist(B, A) (propiedad métrica)."""
    d_ida = haversine_km(40.4, -3.7, 41.38, 2.17)
    d_vuelta = haversine_km(41.38, 2.17, 40.4, -3.7)
    assert d_ida == pytest.approx(d_vuelta, rel=1e-9)


# ── corredor Shapely ───────────────────────────────────────────────────────────

def test_corredor_shapely_contiene_punto_cercano():
    """Un punto prácticamente sobre la ruta debe estar dentro del corredor de 5 km."""
    coordinates = [[-3.7, 40.4], [-1.5, 41.0], [2.17, 41.38]]
    corredor = build_route_corridor(coordinates, buffer_km=5.0)
    assert corredor.contains(Point(-1.5, 41.0))


def test_corredor_shapely_excluye_punto_lejano():
    """Un punto a >20 km de la ruta Madrid-Barcelona debe quedar fuera del corredor de 5 km."""
    coordinates = [[-3.7, 40.4], [2.17, 41.38]]
    corredor = build_route_corridor(coordinates, buffer_km=5.0)
    assert not corredor.contains(Point(-5.99, 37.39))


def test_corredor_punto_unico_genera_buffer():
    """Con una sola coordenada build_route_corridor usa Point.buffer en vez de LineString."""
    corredor = build_route_corridor([[-3.7, 40.4]], buffer_km=2.0)
    # El buffer de un punto debe contener el propio punto y no ser None
    assert corredor is not None
    assert corredor.contains(Point(-3.7, 40.4))


# ── approx_road_detour_km ─────────────────────────────────────────────────────

def test_approx_road_detour_km_sin_desvio():
    """Gasolinera sobre el camino directo debe tener desvío muy pequeño."""
    # Origen → Dest Madrid-Barcelona; gasolinera en el punto medio
    detour = approx_road_detour_km(
        40.4, -3.7,       # origen (Madrid)
        40.9, -0.75,      # gasolinera (en ruta)
        41.38, 2.17,      # destino (Barcelona)
        road_factor=1.2,
    )
    assert detour >= 0.0
    assert detour < 50.0  # desvío pequeño para una gasolinera en ruta


def test_approx_road_detour_km_gran_desvio():
    """Gasolinera muy alejada de la ruta debe producir un desvío grande."""
    detour = approx_road_detour_km(
        40.4, -3.7,       # origen (Madrid)
        37.39, -5.99,     # gasolinera (Sevilla — muy fuera de la ruta)
        41.38, 2.17,      # destino (Barcelona)
        road_factor=1.2,
    )
    assert detour > 100.0


def test_approx_road_detour_km_es_no_negativo():
    """El desvío nunca puede ser negativo."""
    detour = approx_road_detour_km(
        40.4, -3.7, 41.38, 2.17, 40.4, -3.7, road_factor=1.0
    )
    assert detour >= 0.0


# ── position_along_route ──────────────────────────────────────────────────────

def test_position_along_route_en_origen():
    """Una estación en el origen debe tener fracción ≈ 0 y km_from_origin ≈ 0."""
    route_line = LineString([[-3.7, 40.4], [2.17, 41.38]])
    fraction, pct, km_from_origin = position_along_route(
        route_line=route_line,
        station_lon=-3.7,
        station_lat=40.4,
        route_dist_km=500.0,
    )
    assert fraction == pytest.approx(0.0, abs=0.01)
    assert pct == pytest.approx(0.0, abs=1.0)
    assert km_from_origin == pytest.approx(0.0, abs=5.0)


def test_position_along_route_en_destino():
    """Una estación en el destino debe tener fracción ≈ 1 y km_from_origin ≈ route_dist."""
    route_line = LineString([[-3.7, 40.4], [2.17, 41.38]])
    fraction, pct, km_from_origin = position_along_route(
        route_line=route_line,
        station_lon=2.17,
        station_lat=41.38,
        route_dist_km=500.0,
    )
    assert fraction == pytest.approx(1.0, abs=0.01)
    assert pct == pytest.approx(100.0, abs=1.0)
    assert km_from_origin == pytest.approx(500.0, abs=5.0)


def test_position_along_route_punto_medio():
    """Una estación a mitad de ruta debe tener fracción ≈ 0.5."""
    route_line = LineString([[0.0, 0.0], [2.0, 0.0]])
    fraction, pct, _ = position_along_route(
        route_line=route_line,
        station_lon=1.0,
        station_lat=0.0,
        route_dist_km=200.0,
    )
    assert fraction == pytest.approx(0.5, abs=0.01)
    assert pct == pytest.approx(50.0, abs=1.0)


# ── normalize_values ──────────────────────────────────────────────────────────

def test_normalize_values_rango_correcto():
    """normalize_values debe producir valores en [0, 1] con min→0 y max→1."""
    vals = [1.3, 1.5, 1.7]
    normed = normalize_values(vals)
    assert normed[0] == pytest.approx(0.0)
    assert normed[-1] == pytest.approx(1.0)
    assert all(0.0 <= v <= 1.0 for v in normed)


def test_normalize_values_lista_vacia():
    """normalize_values con lista vacía debe devolver lista vacía."""
    assert normalize_values([]) == []


def test_normalize_values_todos_iguales():
    """normalize_values con todos los valores iguales debe devolver 0.5 para cada uno."""
    result = normalize_values([1.5, 1.5, 1.5])
    assert result == [pytest.approx(0.5)] * 3


# ── km_to_minutes / minutes_to_km ────────────────────────────────────────────

def test_km_to_minutes_conversion():
    """80 km a 80 km/h deben tardar exactamente 60 minutos."""
    assert km_to_minutes(80.0, 80.0) == pytest.approx(60.0)


def test_km_to_minutes_velocidad_cero():
    """Con velocidad 0 o negativa km_to_minutes devuelve 0.0 sin dividir por cero."""
    assert km_to_minutes(50.0, 0.0) == pytest.approx(0.0)
    assert km_to_minutes(50.0, -10.0) == pytest.approx(0.0)


def test_minutes_to_km_conversion():
    """60 minutos a 90 km/h equivalen a 90 km."""
    assert minutes_to_km(60.0, 90.0) == pytest.approx(90.0)


def test_minutes_to_km_inverso_de_km_to_minutes():
    """minutes_to_km y km_to_minutes deben ser inversas entre sí."""
    km_orig = 120.0
    speed = 100.0
    mins = km_to_minutes(km_orig, speed)
    km_back = minutes_to_km(mins, speed)
    assert km_back == pytest.approx(km_orig, rel=1e-6)
