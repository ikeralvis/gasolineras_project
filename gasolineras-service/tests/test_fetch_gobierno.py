"""Tests para el parser de la API del ministerio."""

import pytest

from app.services.fetch_gobierno import parse_gasolinera


def test_parse_gasolinera_includes_95_premium_and_diesel_renovable():
    raw = {
        "IDEESS": "10890",
        "Rótulo": "REPSOL",
        "Municipio": "BILBAO",
        "Provincia": "BIZKAIA",
        "Dirección": "VIADUCTO MIRAFLORES LARREAGABURU, 2",
        "Precio Gasolina 95 E5": "1,565",
        "Precio Gasolina 95 E5 Premium": "1,635",
        "Precio Gasolina 98 E5": "1,675",
        "Precio Gasoleo A": "1,955",
        "Precio Gasoleo Premium": "",
        "Precio Diésel Renovable": "2,065",
        "Latitud": "43,248472",
        "Longitud (WGS84)": "-2,924778",
        "Horario": "L-D: 24H",
    }

    parsed = parse_gasolinera(raw)

    assert parsed is not None
    assert parsed["Precio Gasolina 95 E5 Premium"] == "1,635"
    assert parsed["Precio Diésel Renovable"] == "2,065"
    assert parsed["Precio Gasoleo Premium"] == ""
    assert parsed["Latitud"] == pytest.approx(43.248472)
    assert parsed["Longitud"] == pytest.approx(-2.924778)


def test_parse_gasolinera_accepts_legacy_gasoleo_premium_key_with_tilde():
    raw = {
        "IDEESS": "99999",
        "Rótulo": "TEST",
        "Municipio": "TEST",
        "Provincia": "TEST",
        "Dirección": "TEST 1",
        "Precio Gasolina 95 E5": "1,500",
        "Precio Gasóleo Premium": "1,799",
        "Latitud": "40,000000",
        "Longitud (WGS84)": "-3,000000",
        "Horario": "L-D: 24H",
    }

    parsed = parse_gasolinera(raw)

    assert parsed is not None
    assert parsed["Precio Gasoleo Premium"] == "1,799"
