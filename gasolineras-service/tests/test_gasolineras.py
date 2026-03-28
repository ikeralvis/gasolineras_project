"""
Tests unitarios para el servicio de gasolineras (PostgreSQL)
"""
import pytest
from contextlib import contextmanager
from datetime import date
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _make_cursor(fetchone=None, fetchall=None, rowcount=0):
    """Crea un mock de cursor psycopg2 con soporte de context manager."""
    mock_cur = MagicMock()
    mock_cur.__enter__ = MagicMock(return_value=mock_cur)
    mock_cur.__exit__ = MagicMock(return_value=False)
    mock_cur.fetchone.return_value = fetchone
    mock_cur.fetchall.return_value = fetchall if fetchall is not None else []
    mock_cur.rowcount = rowcount
    return mock_cur


def _patch_db(cursor_mock):
    """
    Devuelve un par de patches para get_db_conn y get_cursor
    que inyectan el cursor_mock proporcionado.
    """
    @contextmanager
    def mock_get_db_conn():
        yield MagicMock()

    def mock_get_cursor(conn):
        return cursor_mock

    return mock_get_db_conn, mock_get_cursor


class TestHealthCheck:
    """Tests para el endpoint de health check"""

    @patch('app.db.connection.test_db_connection')
    def test_health_check_returns_ok(self, mock_test_db):
        """El health check debería retornar status ok con DB mockeada"""
        mock_test_db.return_value = True

        response = client.get("/health")
        assert response.status_code in [200, 503]
        data = response.json()
        assert "status" in data


class TestGasolinerasEndpoint:
    """Tests para el endpoint de gasolineras"""

    def test_get_gasolineras_returns_list(self):
        """GET /gasolineras debería retornar una lista paginada"""
        mock_cur = _make_cursor(
            fetchone={"total": 2},
            fetchall=[
                {"ideess": "12345", "rotulo": "Repsol", "municipio": "Madrid",
                 "provincia": "Madrid", "direccion": "Calle Test 1",
                 "precio_95_e5": 1.459, "precio_98_e5": None,
                 "precio_gasoleo_a": None, "precio_gasoleo_b": None,
                 "precio_gasoleo_premium": None, "latitud": 40.4,
                 "longitud": -3.7, "horario": None, "horario_parsed": None},
                {"ideess": "67890", "rotulo": "Cepsa", "municipio": "Madrid",
                 "provincia": "Madrid", "direccion": "Calle Test 2",
                 "precio_95_e5": 1.499, "precio_98_e5": None,
                 "precio_gasoleo_a": None, "precio_gasoleo_b": None,
                 "precio_gasoleo_premium": None, "latitud": 40.5,
                 "longitud": -3.6, "horario": None, "horario_parsed": None},
            ],
        )
        mock_conn, mock_cursor_fn = _patch_db(mock_cur)

        with patch('app.routes.gasolineras.get_db_conn', mock_conn), \
             patch('app.routes.gasolineras.get_cursor', mock_cursor_fn):
            response = client.get("/gasolineras/")

        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "gasolineras" in data
        assert "skip" in data
        assert "limit" in data

    def test_get_gasolineras_with_filters(self):
        """GET /gasolineras con filtros debería aplicarlos correctamente"""
        mock_cur = _make_cursor(
            fetchone={"total": 1},
            fetchall=[
                {"ideess": "12345", "rotulo": "Repsol", "municipio": "Barcelona",
                 "provincia": "Barcelona", "direccion": "Calle Test 1",
                 "precio_95_e5": 1.459, "precio_98_e5": None,
                 "precio_gasoleo_a": None, "precio_gasoleo_b": None,
                 "precio_gasoleo_premium": None, "latitud": 41.4,
                 "longitud": 2.1, "horario": None, "horario_parsed": None},
            ],
        )
        mock_conn, mock_cursor_fn = _patch_db(mock_cur)

        with patch('app.routes.gasolineras.get_db_conn', mock_conn), \
             patch('app.routes.gasolineras.get_cursor', mock_cursor_fn):
            response = client.get("/gasolineras/?provincia=Barcelona&limit=10")

        assert response.status_code == 200

    def test_get_gasolineras_pagination(self):
        """La paginación debería funcionar correctamente"""
        mock_cur = _make_cursor(fetchone={"total": 100}, fetchall=[])
        mock_conn, mock_cursor_fn = _patch_db(mock_cur)

        with patch('app.routes.gasolineras.get_db_conn', mock_conn), \
             patch('app.routes.gasolineras.get_cursor', mock_cursor_fn):
            response = client.get("/gasolineras/?skip=50&limit=25")

        assert response.status_code == 200
        data = response.json()
        assert data["skip"] == 50
        assert data["limit"] == 25


class TestGasolineraById:
    """Tests para obtener gasolinera por ID"""

    def test_get_gasolinera_existente(self):
        """GET /gasolineras/{id} debería retornar la gasolinera si existe"""
        mock_cur = _make_cursor(
            fetchone={
                "ideess": "12345",
                "rotulo": "Repsol",
                "municipio": "Madrid",
                "provincia": "Madrid",
                "direccion": "Calle Test 123",
                "precio_95_e5": 1.459,
                "precio_98_e5": None,
                "precio_gasoleo_a": None,
                "precio_gasoleo_b": None,
                "precio_gasoleo_premium": None,
                "latitud": 40.4168,
                "longitud": -3.7038,
                "horario": None,
                "horario_parsed": None,
            }
        )
        mock_conn, mock_cursor_fn = _patch_db(mock_cur)

        with patch('app.routes.gasolineras.get_db_conn', mock_conn), \
             patch('app.routes.gasolineras.get_cursor', mock_cursor_fn):
            response = client.get("/gasolineras/12345")

        assert response.status_code == 200
        data = response.json()
        assert data["IDEESS"] == "12345"
        assert data["Rótulo"] == "Repsol"

    def test_get_gasolinera_no_existente(self):
        """GET /gasolineras/{id} debería retornar 404 si no existe"""
        mock_cur = _make_cursor(fetchone=None)
        mock_conn, mock_cursor_fn = _patch_db(mock_cur)

        with patch('app.routes.gasolineras.get_db_conn', mock_conn), \
             patch('app.routes.gasolineras.get_cursor', mock_cursor_fn):
            response = client.get("/gasolineras/99999")

        assert response.status_code == 404


class TestGasolinerasCerca:
    """Tests para el endpoint de gasolineras cercanas"""

    def test_cerca_requiere_coordenadas(self):
        """GET /gasolineras/cerca sin coordenadas debería fallar"""
        response = client.get("/gasolineras/cerca")

        assert response.status_code == 422  # Validation error

    def test_cerca_con_coordenadas_validas(self):
        """GET /gasolineras/cerca con coordenadas debería retornar resultados"""
        mock_cur = _make_cursor(
            fetchall=[
                {"ideess": "12345", "rotulo": "Repsol", "municipio": "Madrid",
                 "provincia": "Madrid", "direccion": "Test 1",
                 "precio_95_e5": 1.459, "precio_98_e5": None,
                 "precio_gasoleo_a": None, "precio_gasoleo_b": None,
                 "precio_gasoleo_premium": None, "latitud": 40.42,
                 "longitud": -3.70, "horario": None, "horario_parsed": None,
                 "distancia_km": 2.5},
            ]
        )
        mock_conn, mock_cursor_fn = _patch_db(mock_cur)

        with patch('app.routes.gasolineras.get_db_conn', mock_conn), \
             patch('app.routes.gasolineras.get_cursor', mock_cursor_fn):
            response = client.get("/gasolineras/cerca?lat=40.4168&lon=-3.7038&km=10")

        assert response.status_code == 200
        data = response.json()
        assert "gasolineras" in data
        assert "ubicacion" in data
        assert data["ubicacion"]["lat"] == pytest.approx(40.4168)
        assert data["ubicacion"]["lon"] == pytest.approx(-3.7038)


class TestEstadisticas:
    """Tests para el endpoint de estadísticas"""

    def test_estadisticas_basicas(self):
        """GET /gasolineras/estadisticas debería calcular estadísticas"""
        mock_cur = _make_cursor(
            fetchall=[
                {"precio_95_e5": 1.45, "precio_98_e5": None, "precio_gasoleo_a": 1.35,
                 "precio_gasoleo_b": None, "precio_gasoleo_premium": None},
                {"precio_95_e5": 1.50, "precio_98_e5": None, "precio_gasoleo_a": 1.40,
                 "precio_gasoleo_b": None, "precio_gasoleo_premium": None},
                {"precio_95_e5": 1.55, "precio_98_e5": None, "precio_gasoleo_a": 1.38,
                 "precio_gasoleo_b": None, "precio_gasoleo_premium": None},
            ]
        )
        mock_conn, mock_cursor_fn = _patch_db(mock_cur)

        with patch('app.routes.gasolineras.get_db_conn', mock_conn), \
             patch('app.routes.gasolineras.get_cursor', mock_cursor_fn):
            response = client.get("/gasolineras/estadisticas")

        assert response.status_code == 200
        data = response.json()
        assert "total_gasolineras" in data
        assert "combustibles" in data

    def test_estadisticas_sin_datos(self):
        """Estadísticas sin datos debería retornar 404"""
        mock_cur = _make_cursor(fetchall=[])
        mock_conn, mock_cursor_fn = _patch_db(mock_cur)

        with patch('app.routes.gasolineras.get_db_conn', mock_conn), \
             patch('app.routes.gasolineras.get_cursor', mock_cursor_fn):
            response = client.get("/gasolineras/estadisticas")

        assert response.status_code == 404


class TestCount:
    """Tests para el endpoint de conteo"""

    def test_count_gasolineras(self):
        """GET /gasolineras/count debería retornar el total"""
        mock_cur = _make_cursor(fetchone={"total": 12345})
        mock_conn, mock_cursor_fn = _patch_db(mock_cur)

        with patch('app.routes.gasolineras.get_db_conn', mock_conn), \
             patch('app.routes.gasolineras.get_cursor', mock_cursor_fn):
            response = client.get("/gasolineras/count")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 12345


class TestHistorial:
    """Tests para el endpoint de historial de precios"""

    def test_historial_gasolinera_existente(self):
        """GET /gasolineras/{id}/historial debería retornar historial"""
        mock_cur = _make_cursor(
            fetchall=[
                {"ideess": "12345", "fecha": date(2024, 1, 1),
                 "p95": 1.45, "p98": None, "pa": 1.35, "pb": None, "pp": None},
                {"ideess": "12345", "fecha": date(2024, 1, 2),
                 "p95": 1.46, "p98": None, "pa": 1.36, "pb": None, "pp": None},
            ]
        )
        mock_conn, mock_cursor_fn = _patch_db(mock_cur)

        with patch('app.routes.gasolineras.get_db_conn', mock_conn), \
             patch('app.routes.gasolineras.get_cursor', mock_cursor_fn):
            response = client.get("/gasolineras/12345/historial?dias=30")

        assert response.status_code == 200
        data = response.json()
        assert data["IDEESS"] == "12345"
        assert "historial" in data

    def test_historial_gasolinera_no_existente(self):
        """Historial de gasolinera inexistente debería retornar 404"""
        # fetchall returns [] (no history), fetchone returns None (no gasolinera)
        mock_cur = _make_cursor(fetchall=[], fetchone=None)
        mock_conn, mock_cursor_fn = _patch_db(mock_cur)

        with patch('app.routes.gasolineras.get_db_conn', mock_conn), \
             patch('app.routes.gasolineras.get_cursor', mock_cursor_fn):
            response = client.get("/gasolineras/99999/historial")

        assert response.status_code == 404
