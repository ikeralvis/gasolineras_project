"""Tests para el parser y cliente de la API del ministerio."""
import pytest
from unittest.mock import MagicMock, patch
import httpx

from app.services.fetch_gobierno import (
    fetch_data_gobierno,
    get_http_client,
    parse_gasolinera,
    parse_horario,
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _raw(**overrides):
    base = {
        "IDEESS": "12345",
        "Rótulo": "REPSOL",
        "Municipio": "BILBAO",
        "Provincia": "BIZKAIA",
        "Dirección": "VIADUCTO TEST 1",
        "Precio Gasolina 95 E5": "1,565",
        "Precio Gasolina 95 E5 Premium": "1,635",
        "Precio Gasolina 98 E5": "1,675",
        "Precio Gasoleo A": "1,955",
        "Precio Gasoleo Premium": "",
        "Precio Diésel Renovable": "2,065",
        "Latitud": "43,248472",
        "Longitud (WGS84)": "-2,924778",
        "Horario": "L-D: 07:00-22:00",
    }
    base.update(overrides)
    return base


def _mock_client(response_data):
    """Construye un context-manager mock que devuelve response_data como JSON."""
    mock_response = MagicMock()
    mock_response.json.return_value = response_data
    mock_response.raise_for_status.return_value = None

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.return_value = mock_response
    return mock_client


# ── parse_gasolinera ──────────────────────────────────────────────────────────

def test_parse_gasolinera_includes_95_premium_and_diesel_renovable():
    parsed = parse_gasolinera(_raw())
    assert parsed is not None
    assert parsed["Precio Gasolina 95 E5 Premium"] == "1,635"
    assert parsed["Precio Diésel Renovable"] == "2,065"
    assert parsed["Precio Gasoleo Premium"] == ""
    assert parsed["Latitud"] == pytest.approx(43.248472)
    assert parsed["Longitud"] == pytest.approx(-2.924778)


def test_parse_gasolinera_accepts_legacy_gasoleo_premium_key_with_tilde():
    raw = _raw()
    raw.pop("Precio Gasoleo Premium", None)
    raw["Precio Gasóleo Premium"] = "1,799"
    parsed = parse_gasolinera(raw)
    assert parsed is not None
    assert parsed["Precio Gasoleo Premium"] == "1,799"


def test_parse_gasolinera_rotulo_stripped():
    parsed = parse_gasolinera(_raw(**{"Rótulo": "  CEPSA  "}))
    assert parsed["Rótulo"] == "CEPSA"


def test_parse_gasolinera_returns_none_on_exception():
    """Datos inválidos (None) capturan la excepción y devuelven None."""
    assert parse_gasolinera(None) is None


def test_parse_gasolinera_missing_coordinates_parsed_as_none():
    parsed = parse_gasolinera(_raw(Latitud="", **{"Longitud (WGS84)": ""}))
    assert parsed["Latitud"] is None
    assert parsed["Longitud"] is None


def test_parse_gasolinera_horario_parsed_included():
    parsed = parse_gasolinera(_raw(Horario="24H"))
    assert parsed["Horario_parsed"] is not None
    assert parsed["Horario_parsed"]["siempre_abierto"] is True


# ── parse_horario ─────────────────────────────────────────────────────────────

def test_parse_horario_handles_full_week_24h():
    parsed = parse_horario("L-D: 24H")
    assert parsed is not None
    assert parsed["siempre_abierto"] is True
    assert parsed["segmentos"] == []


def test_parse_horario_keeps_weekday_24h_segment():
    parsed = parse_horario("L-V: 24H")
    assert parsed is not None
    assert parsed["siempre_abierto"] is False
    assert parsed["segmentos"] == [
        {"dias": [1, 2, 3, 4, 5], "apertura": "00:00", "cierre": "23:59"}
    ]


def test_parse_horario_none_returns_none():
    assert parse_horario(None) is None


def test_parse_horario_empty_string_returns_none():
    assert parse_horario("") is None


# ── get_http_client ───────────────────────────────────────────────────────────

def test_get_http_client_returns_httpx_client():
    client = get_http_client()
    assert isinstance(client, httpx.Client)
    client.close()


# ── fetch_data_gobierno ───────────────────────────────────────────────────────

@patch("app.services.fetch_gobierno.get_http_client")
def test_fetch_data_gobierno_happy_path(mock_get_client):
    records = [_raw(), _raw(IDEESS="99999")]
    mock_get_client.return_value = _mock_client({"ListaEESSPrecio": records})

    result = fetch_data_gobierno()

    assert len(result) == 2
    assert result[0]["IDEESS"] == "12345"
    assert result[1]["IDEESS"] == "99999"


@patch("app.services.fetch_gobierno.get_http_client")
def test_fetch_data_gobierno_empty_lista_devuelve_lista_vacia(mock_get_client):
    mock_get_client.return_value = _mock_client({"ListaEESSPrecio": []})

    result = fetch_data_gobierno()

    assert result == []


@patch("app.services.fetch_gobierno.get_http_client")
def test_fetch_data_gobierno_non_dict_response_raises(mock_get_client):
    mock_get_client.return_value = _mock_client(["no", "es", "dict"])

    with pytest.raises(ValueError):
        fetch_data_gobierno()


@patch("app.services.fetch_gobierno.get_http_client")
def test_fetch_data_gobierno_skips_invalid_records(mock_get_client):
    """Registros donde parse_gasolinera devuelve None se saltan sin romper."""
    records = [_raw(), None, _raw(IDEESS="99999")]
    mock_get_client.return_value = _mock_client({"ListaEESSPrecio": records})

    result = fetch_data_gobierno()

    assert len(result) == 2


@patch("app.services.fetch_gobierno.get_http_client")
def test_fetch_data_gobierno_timeout_raises(mock_get_client):
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.side_effect = httpx.TimeoutException("timeout")
    mock_get_client.return_value = mock_client

    with pytest.raises(httpx.TimeoutException):
        fetch_data_gobierno()


@patch("app.services.fetch_gobierno.get_http_client")
def test_fetch_data_gobierno_connect_error_raises(mock_get_client):
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.side_effect = httpx.ConnectError("connection refused")
    mock_get_client.return_value = mock_client

    with pytest.raises(httpx.ConnectError):
        fetch_data_gobierno()


@patch("app.services.fetch_gobierno.get_http_client")
def test_fetch_data_gobierno_http_status_error_raises(mock_get_client):
    mock_response = MagicMock()
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "404 Not Found", request=MagicMock(), response=MagicMock(status_code=404)
    )
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.return_value = mock_response
    mock_get_client.return_value = mock_client

    with pytest.raises(httpx.HTTPStatusError):
        fetch_data_gobierno()


@patch("app.services.fetch_gobierno.get_http_client")
def test_fetch_data_gobierno_request_error_raises(mock_get_client):
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.side_effect = httpx.RequestError("request error")
    mock_get_client.return_value = mock_client

    with pytest.raises(httpx.RequestError):
        fetch_data_gobierno()


@patch("app.services.fetch_gobierno.get_http_client")
def test_fetch_data_gobierno_registros_sin_coordenadas_no_se_saltan(mock_get_client):
    """Registros sin coordenadas se incluyen igualmente (solo se loguea la advertencia)."""
    records = [_raw(Latitud="", **{"Longitud (WGS84)": ""})]
    mock_get_client.return_value = _mock_client({"ListaEESSPrecio": records})

    result = fetch_data_gobierno()

    assert len(result) == 1
    assert result[0]["Latitud"] is None
    assert result[0]["Longitud"] is None
