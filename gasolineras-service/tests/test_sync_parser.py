"""Tests unitarios para el parser del Ministerio de Industria (sin red, sin BD)."""
import pytest

from app.services.fetch_gobierno import _expand_dias, parse_float, parse_gasolinera, parse_horario


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

    assert result is not None
    assert result["IDEESS"] == "12345"
    assert result["Rótulo"] == "REPSOL"
    assert result["Municipio"] == "MADRID"
    assert result["Provincia"] == "MADRID"
    assert result["Latitud"] == pytest.approx(40.4168, rel=1e-3)
    assert result["Longitud"] == pytest.approx(-3.7038, rel=1e-3)
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


def test_parse_float_valor_no_string():
    """parse_float acepta un valor numérico (int/float) directamente."""
    assert parse_float(1) == pytest.approx(1.0)
    assert parse_float(1.5) == pytest.approx(1.5)


def test_parse_float_valor_no_parseable():
    """parse_float devuelve None si el valor no puede convertirse a float."""
    assert parse_float("abc") is None
    assert parse_float("precio") is None


def test_parse_gasolinera_fallback_rotulo_sin_tilde():
    """Rótulo sin tilde (legacy) se parsea igualmente."""
    datos = {**FIXTURE_MINISTERIO, "Rótulo": "CEPSA"}
    result = parse_gasolinera(datos)
    assert result["Rótulo"] == "CEPSA"


def test_parse_gasolinera_preserva_horario_parsed():
    """Horario_parsed debe ser el resultado de parse_horario aplicado al campo Horario."""
    result = parse_gasolinera(FIXTURE_MINISTERIO)
    assert result is not None
    assert result["Horario_parsed"] is not None
    assert result["Horario_parsed"]["siempre_abierto"] is False


# ── _expand_dias ───────────────────────────────────────────────────────────────

def test_expand_dias_rango_completo():
    """L-D debe expandirse a [1,2,3,4,5,6,7]."""
    assert _expand_dias("L-D") == [1, 2, 3, 4, 5, 6, 7]


def test_expand_dias_rango_semana_laboral():
    """L-V debe expandirse a [1,2,3,4,5]."""
    assert _expand_dias("L-V") == [1, 2, 3, 4, 5]


def test_expand_dias_rango_fin_de_semana():
    """S-D debe expandirse a [6,7]."""
    assert _expand_dias("S-D") == [6, 7]


def test_expand_dias_dia_suelto():
    """Un día individual (ej. 'L') devuelve lista de un elemento."""
    assert _expand_dias("L") == [1]
    assert _expand_dias("D") == [7]
    assert _expand_dias("X") == [3]


def test_expand_dias_lista_comas():
    """Formato 'L,M,S' → [1,2,6] (lista separada por comas)."""
    result = _expand_dias("L,M,S")
    assert result == [1, 2, 6]


def test_expand_dias_desconocido():
    """Expresión no reconocida devuelve lista vacía sin lanzar excepción."""
    assert _expand_dias("Z") == []
    assert _expand_dias("") == []


def test_expand_dias_rango_circular():
    """D-L (domingo a lunes, semana circular) cubre D=7 y L=1."""
    result = _expand_dias("D-L")
    assert 7 in result
    assert 1 in result


# ── parse_horario ──────────────────────────────────────────────────────────────

def test_horario_24h_detectado():
    """'24H' debe reconocerse como siempre_abierto."""
    h = parse_horario("24H")
    assert h is not None
    assert h["siempre_abierto"] is True


def test_horario_24h_con_espacio():
    """'24 H' y '24 HORAS' son también siempre_abierto."""
    assert parse_horario("24 H")["siempre_abierto"] is True
    assert parse_horario("24 HORAS")["siempre_abierto"] is True


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


def test_horario_multisegmento():
    """'L-V: 06:00-22:00; S-D: 08:00-15:00' debe generar dos segmentos."""
    h = parse_horario("L-V: 06:00-22:00; S-D: 08:00-15:00")
    assert h is not None
    assert h["siempre_abierto"] is False
    assert len(h["segmentos"]) == 2
    dias_seg1 = set(h["segmentos"][0]["dias"])
    dias_seg2 = set(h["segmentos"][1]["dias"])
    assert dias_seg1 == {1, 2, 3, 4, 5}
    assert dias_seg2 == {6, 7}


def test_horario_dias_coma():
    """'L,M,X: 08:00-20:00' debe generar un segmento con días [1,2,3]."""
    h = parse_horario("L,M,X: 08:00-20:00")
    assert h is not None
    seg = h["segmentos"][0]
    assert set(seg["dias"]) == {1, 2, 3}
    assert seg["apertura"] == "08:00"
    assert seg["cierre"] == "20:00"


def test_horario_semana_completa_24h():
    """'L-D: 24H' → siempre_abierto True (toda la semana abierta 24h)."""
    h = parse_horario("L-D: 24H")
    assert h is not None
    assert h["siempre_abierto"] is True


def test_horario_segmento_24h_parcial():
    """'L-V: 24H; S-D: 08:00-22:00' → primer segmento con apertura 00:00-23:59."""
    h = parse_horario("L-V: 24H; S-D: 08:00-22:00")
    assert h is not None
    seg_24h = next((s for s in h["segmentos"] if s["apertura"] == "00:00"), None)
    assert seg_24h is not None
    assert seg_24h["cierre"] == "23:59"


def test_horario_texto_no_reconocido():
    """Un horario con formato desconocido devuelve dict con segmentos vacíos."""
    h = parse_horario("CONSULTAR EN GASOLINERA")
    assert h is not None
    assert h["siempre_abierto"] is False
    assert h["segmentos"] == []


def test_horario_none_devuelve_none():
    """Horario None o vacío → parse_horario devuelve None sin errores."""
    assert parse_horario(None) is None
    assert parse_horario("") is None
    assert parse_horario("   ") is None
