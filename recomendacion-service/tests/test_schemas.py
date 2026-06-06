"""Tests unitarios puros para los schemas Pydantic de recomendación."""
import pytest
from pydantic import ValidationError

from app.models.schemas import Coordenada, GasolineraInternal, RecomendacionRequest


# ── Coordenada ────────────────────────────────────────────────────────────────

def test_coordenada_valida():
    c = Coordenada(lat=40.4168, lon=-3.7038)
    assert c.lat == pytest.approx(40.4168)
    assert c.lon == pytest.approx(-3.7038)


def test_coordenada_lat_fuera_de_rango():
    with pytest.raises(ValidationError):
        Coordenada(lat=91.0, lon=0.0)


def test_coordenada_lon_fuera_de_rango():
    with pytest.raises(ValidationError):
        Coordenada(lat=0.0, lon=181.0)


def test_coordenada_nombre_opcional():
    c = Coordenada(lat=40.0, lon=-3.0, nombre="Madrid")
    assert c.nombre == "Madrid"
    c2 = Coordenada(lat=40.0, lon=-3.0)
    assert c2.nombre is None


# ── GasolineraInternal ────────────────────────────────────────────────────────

def test_gasolinera_internal_sin_precio_no_tiene_precio():
    g = GasolineraInternal(lat=40.0, lon=-3.0, precio=None)
    assert g.tiene_precio is False


def test_gasolinera_internal_precio_cero_no_tiene_precio():
    g = GasolineraInternal(lat=40.0, lon=-3.0, precio=0.0)
    assert g.tiene_precio is False


def test_gasolinera_internal_precio_valido_tiene_precio():
    g = GasolineraInternal(lat=40.0, lon=-3.0, precio=1.459)
    assert g.tiene_precio is True


def test_gasolinera_internal_defaults_opcionales():
    g = GasolineraInternal(lat=40.0, lon=-3.0)
    assert g.nombre is None
    assert g.es_area_servicio is False
    assert g.osm_highway is None


# ── RecomendacionRequest — validate_weights ────────────────────────────────────

_ORIGIN = Coordenada(lat=40.4, lon=-3.7)
_DEST = Coordenada(lat=41.4, lon=2.2)


def test_pesos_que_suman_1_se_mantienen():
    """Pesos válidos que ya suman 1.0 no se modifican."""
    req = RecomendacionRequest(origen=_ORIGIN, destino=_DEST, peso_precio=0.7, peso_desvio=0.3)
    assert req.peso_precio == pytest.approx(0.7, abs=0.01)
    assert req.peso_desvio == pytest.approx(0.3, abs=0.01)


def test_pesos_que_no_suman_1_se_normalizan():
    """Pesos que no suman 1.0 se normalizan automáticamente."""
    req = RecomendacionRequest(origen=_ORIGIN, destino=_DEST, peso_precio=0.8, peso_desvio=0.8)
    assert req.peso_precio == pytest.approx(0.5, abs=0.01)
    assert req.peso_desvio == pytest.approx(0.5, abs=0.01)
    assert req.peso_precio + req.peso_desvio == pytest.approx(1.0, abs=0.01)


def test_pesos_cero_se_resetean_a_defaults():
    """Si ambos pesos son 0 se resetean a 0.6/0.4 (protección contra división por cero)."""
    req = RecomendacionRequest(origen=_ORIGIN, destino=_DEST, peso_precio=0.0, peso_desvio=0.0)
    assert req.peso_precio == pytest.approx(0.6, abs=0.01)
    assert req.peso_desvio == pytest.approx(0.4, abs=0.01)


def test_request_valores_por_defecto():
    """Los valores por defecto del request son los documentados."""
    req = RecomendacionRequest(origen=_ORIGIN, destino=_DEST)
    assert req.combustible == "gasolina_95"
    assert req.max_desvio_km == pytest.approx(5.0)
    assert req.top_n == 5
    assert req.evitar_peajes is False
    assert req.posicion_actual is None
    assert req.max_desvio_min is None


def test_request_alias_origin_destination():
    """Aliases ingleses 'origin'/'destination' se mapean correctamente."""
    req = RecomendacionRequest(
        origin={"lat": 40.4, "lon": -3.7},
        destination={"lat": 41.4, "lon": 2.2},
    )
    assert req.origen.lat == pytest.approx(40.4)
    assert req.destino.lat == pytest.approx(41.4)


def test_request_max_desvio_km_fuera_de_rango():
    """max_desvio_km > 50 debe lanzar ValidationError."""
    with pytest.raises(ValidationError):
        RecomendacionRequest(origen=_ORIGIN, destino=_DEST, max_desvio_km=51.0)


def test_request_top_n_fuera_de_rango():
    """top_n > 100 debe lanzar ValidationError."""
    with pytest.raises(ValidationError):
        RecomendacionRequest(origen=_ORIGIN, destino=_DEST, top_n=101)
