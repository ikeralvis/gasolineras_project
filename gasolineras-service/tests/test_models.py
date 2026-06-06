"""Tests unitarios para validación del modelo Pydantic Gasolinera."""
import pytest
from pydantic import ValidationError

from app.models.gasolinera import Gasolinera


def test_gasolinera_pydantic_valida_campos_requeridos():
    """El schema acepta un payload completo y mapea aliases correctamente."""
    data = {
        "IDEESS": "12345",
        "Rótulo": "REPSOL",
        "Municipio": "MADRID",
        "Provincia": "MADRID",
        "Precio Gasolina 95 E5": "1.459",
        "Precio Gasoleo A": "1.329",
        "Latitud": "40,4168",
        "Longitud": "-3,7038",
    }
    g = Gasolinera.model_validate(data)

    assert g.IDEESS == "12345"
    assert g.Rótulo == "REPSOL"
    assert g.precio_gasolina_95_e5 == "1.459"
    assert g.precio_gasoleo_a == "1.329"
    # El validador convierte la coma decimal española a float
    assert g.Latitud == pytest.approx(40.4168, rel=1e-4)
    assert g.Longitud == pytest.approx(-3.7038, rel=1e-4)


def test_gasolinera_acepta_precio_null():
    """precio None es válido — estación sin precio actualizado."""
    g = Gasolinera.model_validate({"IDEESS": "99999"})

    assert g.IDEESS == "99999"
    assert g.precio_gasolina_95_e5 is None
    assert g.precio_gasoleo_a is None
    assert g.precio_gasolina_98_e5 is None


def test_gasolinera_coordenadas_invalidas_devuelven_none():
    """Coordenadas no numéricas se mapean a None sin lanzar excepción."""
    g = Gasolinera.model_validate({"IDEESS": "X", "Latitud": "n/a", "Longitud": ""})

    assert g.Latitud is None
    assert g.Longitud is None


def test_gasolinera_todos_los_campos_opcionales():
    """El modelo acepta un objeto vacío — todos los campos son Optional."""
    g = Gasolinera.model_validate({})

    assert g.IDEESS is None
    assert g.Rótulo is None
    assert g.Municipio is None
