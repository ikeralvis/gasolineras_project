"""Tests unitarios para el parser del Ministerio de Industria (sin red, sin BD)."""
import pytest

from app.services.fetch_gobierno import parse_float, parse_gasolinera, parse_horario


# Fixture representativo del JSON real del Ministerio
FIXTURE_MINISTERIO = {
    "IDEESS": "12345",
    "Rótulo": "REPSOL",
    "Municipio": "MADRID",
    "Provincia": "MADRID",
    "Dirección": "CALLE MAYOR 1",
    "Latitud": "40,4168",
    "Longitud (WGS84)": "-3,7038",
    "Horario": "L-D: 07:00-22:00",
    "Precio Gasolina 95 E5": "1,459",
    "Precio Gasolina 95 E5 Premium": "",
    "Precio Gasolina 98 E5": "1,699",
    "Precio Gasoleo A": "1,329",
    "Precio Gasoleo B": "",
    "Precio Gasoleo Premium": "1,489",
    "Precio Diésel Renovable": "",
}


# ── parse_gasolinera ───────────────────────────────────────────────────────────

def test_parseo_respuesta_ministerio():
    """Fixture JSON del Ministerio → estructura de gasolinera correctamente mapeada."""
    result = parse_gasolinera(FIXTURE_MINISTERIO)

    assert result is not None, "parse_gasolinera no debe devolver None para un registro válido"
    assert result["IDEESS"] == "12345"
    assert result["Rótulo"] == "REPSOL"
    assert result["Municipio"] == "MADRID"
    assert result["Provincia"] == "MADRID"
    assert result["Latitud"] == pytest.approx(40.4168, rel=1e-3)
    assert result["Longitud"] == pytest.approx(-3.7038, rel=1e-3)
    # Los campos de precio se preservan tal como vienen (coma decimal)
    assert result["Precio Gasolina 95 E5"] == "1,459"
    assert result["Precio Gasoleo A"] == "1,329"


def test_parseo_maneja_campo_precio_vacio():
    """Campo de precio vacío "" → None devuelto por parse_float, sin excepción."""
    assert parse_float("") is None
    assert parse_float(None) is None


def test_parseo_convierte_coma_decimal():
    """parse_float convierte correctamente el formato español con coma."""
    assert parse_float("1,459") == pytest.approx(1.459, rel=1e-4)
    assert parse_float("1.459") == pytest.approx(1.459, rel=1e-4)


def test_parseo_registro_con_coordenadas_vacias():
    """Un registro sin Latitud/Longitud se parsea sin error; coordenadas quedan None."""
    datos_sin_coords = {**FIXTURE_MINISTERIO, "Latitud": "", "Longitud (WGS84)": ""}
    result = parse_gasolinera(datos_sin_coords)

    assert result is not None
    assert result["Latitud"] is None
    assert result["Longitud"] is None


# ── parse_horario ──────────────────────────────────────────────────────────────

def test_horario_24h_detectado():
    """'24H' debe reconocerse como siempre_abierto."""
    h = parse_horario("24H")
    assert h is not None
    assert h["siempre_abierto"] is True


def test_horario_rango_semanal_completo():
    """'L-D: 07:00-22:00' debe generar 7 días con apertura/cierre correctos."""
    h = parse_horario("L-D: 07:00-22:00")
    assert h is not None
    assert h["siempre_abierto"] is False
    assert len(h["segmentos"]) == 1
    seg = h["segmentos"][0]
    assert set(seg["dias"]) == {1, 2, 3, 4, 5, 6, 7}
    assert seg["apertura"] == "07:00"
    assert seg["cierre"] == "22:00"


def test_horario_none_devuelve_none():
    """Horario None o vacío → parse_horario devuelve None sin errores."""
    assert parse_horario(None) is None
    assert parse_horario("") is None
    assert parse_horario("   ") is None
