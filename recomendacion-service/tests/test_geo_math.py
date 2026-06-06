"""Tests unitarios puros para funciones geométricas de geo_math.py."""
import pytest
from shapely.geometry import Point

from app.services.geo_math import (
    build_route_corridor,
    haversine_km,
    km_to_minutes,
    normalize_values,
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
    # Ruta Madrid → Barcelona (coordenadas [lon, lat])
    coordinates = [[-3.7, 40.4], [-1.5, 41.0], [2.17, 41.38]]
    corredor = build_route_corridor(coordinates, buffer_km=5.0)

    # Punto muy próximo a la ruta (sobre el segmento central)
    punto_cercano = Point(-1.5, 41.0)
    assert corredor.contains(punto_cercano), (
        "Un punto sobre la ruta debería estar dentro del corredor de 5 km"
    )


def test_corredor_shapely_excluye_punto_lejano():
    """Un punto a >20 km de la ruta Madrid-Barcelona debe quedar fuera del corredor de 5 km."""
    coordinates = [[-3.7, 40.4], [2.17, 41.38]]
    corredor = build_route_corridor(coordinates, buffer_km=5.0)

    # Sevilla — muy al sur, lejos de la ruta
    punto_lejano = Point(-5.99, 37.39)
    assert not corredor.contains(punto_lejano), (
        "Sevilla no debería estar dentro del corredor Madrid-Barcelona de 5 km"
    )


# ── auxiliares ────────────────────────────────────────────────────────────────

def test_normalize_values_rango_correcto():
    """normalize_values debe producir valores en [0, 1] con min→0 y max→1."""
    vals = [1.3, 1.5, 1.7]
    normed = normalize_values(vals)
    assert normed[0] == pytest.approx(0.0)
    assert normed[-1] == pytest.approx(1.0)
    assert all(0.0 <= v <= 1.0 for v in normed)


def test_km_to_minutes_conversion():
    """80 km a 80 km/h deben tardar exactamente 60 minutos."""
    assert km_to_minutes(80.0, 80.0) == pytest.approx(60.0)
