"""
Endpoints REST del servicio de recomendación.

POST /recomendacion/ruta
    Dada una ruta A→B, devuelve las mejores gasolineras donde repostar.

GET  /recomendacion/cercanas
    Devuelve las gasolineras más cercanas a un punto con precio del combustible.

GET  /recomendacion/combustibles
    Devuelve los tipos de combustible disponibles.
"""
import logging
from datetime import datetime, timezone
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.models.schemas import (
    RecomendacionRequest,
    RecomendacionResponse,
    GasolineraInternal,
    COMBUSTIBLE_FIELD_MAP,
    CombustibleTipo,
)
from app.services.postgis_candidates import (
    fetch_route_candidates_postgis,
    postgis_candidate_source_enabled,
    supports_postgis_fuel,
)
from app.services.recommender import build_recommendations
from app.services.geo_math import build_route_corridor, haversine_km
from shapely.geometry import Point
from app.services.routing import get_route

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/recomendacion", tags=["Recomendación"])


def _parse_coord(raw) -> float:
    return float(str(raw or "").replace(",", "."))


async def _fetch_stations_from_api(
    combustible: str,
    route_coordinates: list,
    buffer_km: float,
    client: httpx.AsyncClient,
) -> list[GasolineraInternal]:
    """Descarga gasolineras de la API interna y filtra en memoria por corredor de ruta."""
    precio_field = COMBUSTIBLE_FIELD_MAP.get(combustible)
    if not precio_field:
        return []

    try:
        resp = await client.get(settings.GASOLINERAS_API_URL, timeout=settings.GASOLINERAS_TIMEOUT_S)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Error al obtener gasolineras de la API interna: %s", exc)
        return []

    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = data.get("gasolineras") or data.get("ListaEESSPrecio") or data.get("data") or []
    else:
        return []

    corridor = build_route_corridor(route_coordinates, buffer_km)

    result: list[GasolineraInternal] = []
    for item in items:
        try:
            lat = _parse_coord(item.get("Latitud") or item.get("latitud"))
            lon = _parse_coord(
                item.get("Longitud (WGS84)") or item.get("Longitud") or item.get("longitud")
            )
            if not corridor.contains(Point(lon, lat)):
                continue
            precio_raw = str(item.get(precio_field) or "").replace(",", ".")
            if not precio_raw:
                continue
            precio = float(precio_raw)
            if precio <= 0:
                continue
            result.append(
                GasolineraInternal(
                    id=str(item.get("IDEESS") or item.get("ideess") or ""),
                    nombre=str(item.get("Rótulo") or item.get("Rotulo") or item.get("rotulo") or ""),
                    direccion=str(item.get("Dirección") or item.get("Direccion") or item.get("direccion") or ""),
                    municipio=str(item.get("Municipio") or item.get("municipio") or ""),
                    provincia=str(item.get("Provincia") or item.get("provincia") or ""),
                    lat=lat,
                    lon=lon,
                    precio=precio,
                    horario=str(item.get("Horario") or item.get("horario") or ""),
                    tipo_venta=str(item.get("Tipo Venta") or item.get("tipo_venta") or ""),
                )
            )
        except (ValueError, TypeError, AttributeError):
            continue

    logger.info("API en memoria candidatas en ruta: %d de %d totales", len(result), len(items))
    return result


def _raise_routing_http_error(exc: Exception, evitar_peajes: bool) -> None:
    message = str(exc)
    lowered = message.lower()

    if "http 400" in lowered or "bad request" in lowered:
        if evitar_peajes:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No se pudo calcular una ruta válida con evitar peajes para este origen/destino. "
                    "Prueba a ampliar el desvío o desactivar temporalmente evitar peajes. "
                    f"Detalle proveedor: {message}"
                ),
            ) from exc

        raise HTTPException(
            status_code=422,
            detail=f"Solicitud de routing inválida para el proveedor configurado: {message}",
        ) from exc

    raise HTTPException(
        status_code=503,
        detail=f"No se pudo calcular la ruta en el proveedor de mapas: {message}",
    ) from exc


# ─────────────────────────────────────────────────────────────────────────────
# POST /recomendacion/ruta  (endpoint principal)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/ruta",
    summary="Recomendar gasolineras en una ruta",
    description="""
Dado un punto **origen** y un **destino**, calcula la ruta A→B y devuelve las
mejores gasolineras donde repostar, ordenadas por una puntuación compuesta
que combina **precio** y **desvío**.

### Cómo funciona
1. Solicita la ruta A→B al motor de routing configurado (OSRM por defecto).
2. Construye un corredor geométrico alrededor de la ruta.
3. Pre-filtra las ~11 000 gasolineras españolas a las que caen en el corredor.
4. Calcula el desvío aproximado (A→gasolinera→B − A→B) para cada candidata.
5. Descarta las que superan `max_desvio_km`.
6. Puntúa con `score = peso_precio*(1−precio_norm) + peso_desvio*(1−desvio_norm)`.
7. Devuelve el `top_n` ordenado de mayor a menor score.

### Campos clave de la respuesta
- `recomendaciones[].score`: puntuación compuesta [0–1], **mayor es mejor**.
- `recomendaciones[].desvio_km`: km extra respecto a la ruta directa.
- `recomendaciones[].porcentaje_ruta`: en qué punto del viaje se encontraría.
- `recomendaciones[].ahorro_vs_mas_cara_eur`: ahorro en € vs la opción más cara
  (solo si proporcionas `litros_deposito`).
""",
)
async def recomendar_ruta(body: RecomendacionRequest) -> RecomendacionResponse:
    ts_start = datetime.now(timezone.utc)
    station_source = "api"

    async with httpx.AsyncClient() as client:
        # 1. Calcular ruta base
        try:
            route = await get_route(
                body.origen.lat,
                body.origen.lon,
                body.destino.lat,
                body.destino.lon,
                evitar_peajes=body.evitar_peajes,
                client=client,
            )
        except Exception as exc:
            _raise_routing_http_error(exc, evitar_peajes=body.evitar_peajes)

        if route.distancia_km < 0.1:
            raise HTTPException(
                status_code=422,
                detail="La distancia entre origen y destino es demasiado pequeña.",
            )

        # 2. Obtener candidatas cercanas a la ruta
        stations: list[GasolineraInternal] = []
        current_position = body.posicion_actual or body.origen
        route_buffer_km = min(body.max_desvio_km * 3, 50.0)

        source_mode = settings.ROUTE_CANDIDATES_SOURCE
        postgis_available = (
            postgis_candidate_source_enabled()
            and supports_postgis_fuel(body.combustible)
        )

        if source_mode == "postgis":
            # Modo estricto: falla si PostGIS no está listo
            if not supports_postgis_fuel(body.combustible):
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "Combustible no soportado por búsqueda PostGIS directa. "
                        "Usa gasolina_95, gasolina_98, gasoleo_a o gasoleo_premium."
                    ),
                )
            if not postgis_candidate_source_enabled():
                raise HTTPException(
                    status_code=503,
                    detail="ROUTE_CANDIDATES_SOURCE=postgis pero DATABASE_URL/asyncpg no están disponibles.",
                )
            try:
                stations = await fetch_route_candidates_postgis(
                    route_coordinates=route.coordinates,
                    combustible=body.combustible,
                    current_lat=current_position.lat,
                    current_lon=current_position.lon,
                    buffer_km=route_buffer_km,
                )
                station_source = "postgis"
            except Exception as exc:
                raise HTTPException(
                    status_code=503,
                    detail=f"Error en búsqueda PostGIS de candidatas: {exc}",
                ) from exc

        else:
            # Modo "auto": intenta PostGIS si está disponible, cae a API en memoria.
            # Modo "api": siempre usa la API en memoria.
            if postgis_available:
                try:
                    stations = await fetch_route_candidates_postgis(
                        route_coordinates=route.coordinates,
                        combustible=body.combustible,
                        current_lat=current_position.lat,
                        current_lon=current_position.lon,
                        buffer_km=route_buffer_km,
                    )
                    station_source = "postgis"
                except Exception as exc:
                    logger.warning("PostGIS falló (modo %s), usando API en memoria: %s", source_mode, exc)
                    stations = []

            if not stations:
                stations = await _fetch_stations_from_api(
                    combustible=body.combustible,
                    route_coordinates=route.coordinates,
                    buffer_km=route_buffer_km,
                    client=client,
                )
                station_source = "api"

    if not stations:
        raise HTTPException(
            status_code=503,
            detail="No se pudieron obtener datos de gasolineras. Inténtalo más tarde.",
        )

    # 3. Recomendar
    result = await build_recommendations(body, route, stations, prefiltered=True)

    # 4. Añadir metadatos
    ts_end = datetime.now(timezone.utc)
    result.metadata = {
        **(result.metadata or {}),
        "routing_backend": settings.ROUTING_BACKEND,
        "routing_via_gateway": False,
        "route_candidates_source": station_source,
        "max_detour_minutes_request": body.max_desvio_min,
        "avoid_tolls": body.evitar_peajes,
        "gasolineras_fuente": settings.GASOLINERAS_API_URL,
        "timestamp_utc": ts_start.isoformat(),
        "procesado_en_ms": round((ts_end - ts_start).total_seconds() * 1000),
    }

    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /recomendacion/cercanas
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/cercanas",
    summary="Gasolineras más cercanas a un punto",
    description="Devuelve las N gasolineras más cercanas a unas coordenadas, con el precio del combustible indicado.",
)
async def cercanas(
    lat: Annotated[float, Query(ge=-90, le=90, description="Latitud WGS84")],
    lon: Annotated[float, Query(ge=-180, le=180, description="Longitud WGS84")],
    combustible: Annotated[CombustibleTipo, Query(description="Tipo de combustible")] = "gasolina_95",
    radio_km: Annotated[float, Query(gt=0, le=100, description="Radio de búsqueda en km")] = 10.0,
    top_n: Annotated[int, Query(ge=1, le=50, description="Número máximo de resultados")] = 10,
):
    stations = await fetch_gasolineras(combustible)
    if not stations:
        raise HTTPException(status_code=503, detail="No se pudieron obtener gasolineras.")

    results = []
    for s in stations:
        if not s.tiene_precio:
            continue
        dist = haversine_km(lat, lon, s.lat, s.lon)
        if dist <= radio_km:
            results.append(
                {
                    "gasolinera": {
                        "id": s.id,
                        "nombre": s.nombre,
                        "direccion": s.direccion,
                        "municipio": s.municipio,
                        "provincia": s.provincia,
                        "lat": s.lat,
                        "lon": s.lon,
                        "horario": s.horario,
                    },
                    "precio_litro": s.precio,
                    "distancia_km": round(dist, 2),
                    "combustible": combustible,
                }
            )

    results.sort(key=lambda x: x["distancia_km"])
    return {
        "total": len(results),
        "radio_km": radio_km,
        "combustible": combustible,
        "gasolineras": results[:top_n],
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /recomendacion/combustibles
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/combustibles",
    summary="Tipos de combustible disponibles",
)
async def combustibles():
    return {
        "combustibles": [
            {"id": k, "campo_api": v}
            for k, v in COMBUSTIBLE_FIELD_MAP.items()
        ]
    }
