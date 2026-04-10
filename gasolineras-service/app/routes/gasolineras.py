"""Rutas HTTP ligeras para gasolineras (orquestadores)."""
from typing import Annotated, Optional

from fastapi import APIRouter, Header, HTTPException, Query

from app.clients.gcs_client import GCSClient
from app.clients.gobierno_client import GobiernoClient
from app.clients.usuarios_client import UsuariosClient
from app.config import settings
from app.models.gasolinera import Gasolinera
from app.models.viewport import MarkersViewport
from app.repositories.gasolineras_repository import GasolinerasRepository
from app.repositories.history_repository import HistoryRepository
from app.services.export_service import ExportService
from app.services.gasolinera_service import GasolineraService
from app.services.memory_store import MemoryStore
from app.services.sync_service import SyncService

router = APIRouter(prefix="/gasolineras", tags=["Gasolineras"])

_gas_repo = GasolinerasRepository()
_history_repo = HistoryRepository()
_memory_store = MemoryStore()
_gobierno_client = GobiernoClient()
_usuarios_client = UsuariosClient(base_url=settings.usuarios_service_url)
_gcs_client = GCSClient()
_sync_service = SyncService(
    settings=settings,
    gas_repo=_gas_repo,
    history_repo=_history_repo,
    gobierno_client=_gobierno_client,
    usuarios_client=_usuarios_client,
    memory_store=_memory_store,
)
_export_service = ExportService(
    settings=settings,
    sync_service=_sync_service,
    gas_repo=_gas_repo,
    memory_store=_memory_store,
    gcs_client=_gcs_client,
)
_gas_service = GasolineraService(
    sync_service=_sync_service,
    gas_repo=_gas_repo,
    history_repo=_history_repo,
    memory_store=_memory_store,
    history_retention_days=settings.history_retention_days,
)


# Compatibilidad con main.py
_sync_lock = _sync_service.sync_lock


def _get_snapshot_state() -> dict:
    return _sync_service.get_snapshot_state()


def _perform_sync(trigger: str = "manual") -> dict:
    return _sync_service.perform_sync(trigger=trigger)


def _validate_internal_secret(x_internal_secret: Optional[str]) -> None:
    if not settings.use_internal_api_secret:
        return
    if not settings.internal_api_secret:
        raise HTTPException(status_code=500, detail="INTERNAL_API_SECRET no configurado")
    if x_internal_secret != settings.internal_api_secret:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post(
    "/markers",
    response_model=dict,
    summary="Obtener markers de gasolineras por viewport",
    description="Devuelve clusters a bajo zoom y estaciones individuales a alto zoom.",
    responses={
        400: {"description": "Viewport inválido"},
        422: {"description": "Parámetros inválidos"},
        500: {"description": "Error interno"},
        503: {"description": "Fuente no disponible"},
    },
)
def get_gasolineras_markers(viewport: MarkersViewport):
    return _gas_service.get_markers(viewport)


@router.get(
    "/",
    response_model=dict,
    summary="Obtener gasolineras",
    description="Obtiene la lista de gasolineras con soporte para filtros y paginación.",
    responses={
        422: {"description": "Parámetros inválidos"},
        500: {"description": "Error interno"},
        503: {"description": "Fuente no disponible"},
    },
)
def get_gasolineras(
    provincia: Annotated[Optional[str], Query(description="Filtrar por provincia")] = None,
    municipio: Annotated[Optional[str], Query(description="Filtrar por municipio")] = None,
    precio_max: Annotated[Optional[float], Query(description="Precio máximo gasolina 95")] = None,
    skip: Annotated[int, Query(ge=0, description="Elementos a saltar")] = 0,
    limit: Annotated[int, Query(ge=1, le=20000, description="Número máximo de resultados")] = 100,
):
    return _gas_service.list_gasolineras(provincia, municipio, precio_max, skip, limit)


@router.get(
    "/cerca",
    summary="Obtener gasolineras cercanas a una ubicación",
    responses={
        422: {"description": "Parámetros inválidos"},
        500: {"description": "Error interno"},
        503: {"description": "Fuente no disponible"},
    },
)
def gasolineras_cerca(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    km: Annotated[float, Query(gt=0, le=200)] = 50,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
):
    return _gas_service.nearby(lat, lon, km, limit)


@router.post(
    "/sync",
    response_model=dict,
    summary="Sincronizar gasolineras desde la API del Gobierno de España",
    responses={403: {"description": "Forbidden"}, 500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def sync_gasolineras(x_internal_secret: Annotated[Optional[str], Header(alias="X-Internal-Secret")] = None):
    _validate_internal_secret(x_internal_secret)
    with _sync_lock:
        return _perform_sync(trigger="manual")


@router.get("/count", response_model=dict, summary="Contar gasolineras", responses={500: {"description": "Error interno"}})
def count_gasolineras():
    return _gas_service.count()


@router.get("/snapshot", response_model=dict, summary="Estado de frescura del snapshot", responses={500: {"description": "Error interno"}})
def snapshot_status():
    return _gas_service.snapshot_status()


@router.post(
    "/ensure-fresh",
    response_model=dict,
    summary="Sincroniza solo si faltan datos actuales",
    responses={403: {"description": "Forbidden"}, 500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def ensure_fresh_gasolineras(x_internal_secret: Annotated[Optional[str], Header(alias="X-Internal-Secret")] = None):
    _validate_internal_secret(x_internal_secret)
    return _gas_service.ensure_fresh()


@router.post(
    "/export-raw-parquet",
    response_model=dict,
    summary="Exportar snapshot actual a Parquet en GCS",
    description=(
        "Exporta el snapshot actual de gasolineras a GCS en formato Parquet bajo "
        "raw/snapshot_date=YYYY-MM-DD/gasolineras.parquet."
    ),
    responses={
        403: {"description": "Forbidden"},
        404: {"description": "Snapshot no disponible"},
        500: {"description": "Error interno"},
    },
)
def export_raw_parquet_to_gcs(x_internal_secret: Annotated[Optional[str], Header(alias="X-Internal-Secret")] = None):
    _validate_internal_secret(x_internal_secret)
    return _export_service.export_snapshot_parquet_result()


@router.post(
    "/daily-sync-export",
    response_model=dict,
    summary="Pipeline diario: asegurar snapshot + exportar Parquet a GCS",
    description=(
        "Orquesta la ejecución diaria para scheduler: "
        "1) sincroniza solo si el snapshot no está vigente (o si force_sync=true), "
        "2) exporta snapshot actual a Parquet en GCS."
    ),
    responses={
        403: {"description": "Forbidden"},
        404: {"description": "Snapshot no disponible"},
        500: {"description": "Error interno"},
    },
)
def daily_sync_export(
    x_internal_secret: Annotated[Optional[str], Header(alias="X-Internal-Secret")] = None,
    force_sync: Annotated[bool, Query(description="Forzar sincronización aunque haya snapshot vigente")] = False,
):
    _validate_internal_secret(x_internal_secret)
    return _gas_service.daily_sync_export(_export_service.export_snapshot_parquet_result, force_sync)


@router.get(
    "/estadisticas",
    response_model=dict,
    summary="Obtener estadísticas de precios",
    responses={
        404: {"description": "Sin datos"},
        422: {"description": "Parámetros inválidos"},
        500: {"description": "Error interno"},
        503: {"description": "Fuente no disponible"},
    },
)
def obtener_estadisticas(
    provincia: Annotated[Optional[str], Query()] = None,
    municipio: Annotated[Optional[str], Query()] = None,
):
    return _gas_service.stats(provincia, municipio)


@router.get(
    "/{id}",
    response_model=Gasolinera,
    summary="Obtener detalles de una gasolinera por ID",
    responses={404: {"description": "No encontrado"}, 500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def get_gasolinera_por_id(id: str):
    return _gas_service.detail(id)


@router.get(
    "/{id}/cercanas",
    summary="Obtener gasolineras cercanas a otra gasolinera",
    responses={404: {"description": "No encontrado"}, 500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def get_gasolineras_cercanas(id: str, radio_km: float = 5):
    return _gas_service.nearby_by_id(id, radio_km)


@router.get(
    "/{id}/historial",
    summary="Obtener historial de precios de una gasolinera",
    responses={404: {"description": "No encontrado"}, 500: {"description": "Error interno"}},
)
def get_historial_precios(
    id: str,
    dias: Annotated[int, Query(ge=1, le=365)] = 30,
):
    return _gas_service.historial(id, dias)
