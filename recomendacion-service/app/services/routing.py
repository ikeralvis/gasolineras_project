"""
Servicio de routing: abstracción sobre OSRM y OpenRouteService.

Backends soportados:
  - osrm : OSRM demo público (router.project-osrm.org) o self-hosted. Sin API key.
  - ors  : OpenRouteService (api.openrouteservice.org). Requiere ORS_API_KEY.
           Plan gratuito: 2 000 req/día, 500 req/min → https://openrouteservice.org/

Fallback automático: si el backend configurado falla, se calcula la ruta con
haversine (línea recta geodésica) para no bloquear la respuesta.
"""
import logging
from math import radians, sin, cos, sqrt, atan2
from typing import Optional

import httpx

from app.config import settings
from app.models.schemas import RouteResult

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Utilidades geométricas
# ─────────────────────────────────────────────────────────────────────────────

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia en km entre dos puntos (WGS84) usando la fórmula de haversine."""
    R = 6_371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _straight_line_route(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> RouteResult:
    """Ruta de fallback: línea recta con velocidad media estimada de 90 km/h."""
    dist_km = haversine_km(lat1, lon1, lat2, lon2)
    speed_kmh = 90.0
    return RouteResult(
        distancia_m=dist_km * 1000,
        duracion_s=(dist_km / speed_kmh) * 3600,
        coordinates=[[lon1, lat1], [lon2, lat2]],
    )


# ─────────────────────────────────────────────────────────────────────────────
# OSRM
# ─────────────────────────────────────────────────────────────────────────────

async def _route_osrm(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    client: httpx.AsyncClient,
) -> RouteResult:
    """
    Solicita ruta al backend OSRM.
    Documentación: http://project-osrm.org/docs/v5.24.0/api/
    """
    url = (
        f"{settings.OSRM_BASE_URL}/route/v1/driving/"
        f"{lon1},{lat1};{lon2},{lat2}"
        f"?overview=full&geometries=geojson&steps=false"
    )
    resp = await client.get(url, timeout=settings.ROUTING_TIMEOUT_S)
    resp.raise_for_status()
    data = resp.json()

    if data.get("code") != "Ok" or not data.get("routes"):
        raise ValueError(f"OSRM devolvió código inesperado: {data.get('code')}")

    route = data["routes"][0]
    coords = route["geometry"]["coordinates"]  # [[lon, lat], ...]

    return RouteResult(
        distancia_m=route["distance"],
        duracion_s=route["duration"],
        coordinates=coords,
    )


# ─────────────────────────────────────────────────────────────────────────────
# OpenRouteService
# ─────────────────────────────────────────────────────────────────────────────

async def _route_ors(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    client: httpx.AsyncClient,
) -> RouteResult:
    """
    Solicita ruta al backend OpenRouteService usando el endpoint GET.
    GET /v2/directions/driving-car?api_key=KEY&start=lon,lat&end=lon,lat
    Devuelve GeoJSON directamente, sin cuerpo de petición.
    Requiere ORS_API_KEY (gratis hasta 2 000 req/día): https://openrouteservice.org/
    """
    if not settings.ORS_API_KEY:
        raise ValueError("ORS_API_KEY no configurada. Añádela al .env.")

    url = (
        f"{settings.ORS_BASE_URL}/v2/directions/driving-car"
        f"?api_key={settings.ORS_API_KEY}"
        f"&start={lon1},{lat1}"
        f"&end={lon2},{lat2}"
    )

    resp = await client.get(url, timeout=settings.ROUTING_TIMEOUT_S)
    resp.raise_for_status()
    data = resp.json()

    feature = data["features"][0]
    summary = feature["properties"]["summary"]
    coords = feature["geometry"]["coordinates"]  # [[lon, lat], ...]

    return RouteResult(
        distancia_m=summary["distance"],
        duracion_s=summary["duration"],
        coordinates=coords,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Punto de entrada principal
# ─────────────────────────────────────────────────────────────────────────────

async def get_route(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    client: Optional[httpx.AsyncClient] = None,
) -> RouteResult:
    """
    Calcula la ruta de conducción entre dos puntos.

    Selecciona el backend según ROUTING_BACKEND y usa fallback automático
    a línea recta si el servicio de routing no está disponible.
    """
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient()

    try:
        if settings.ROUTING_BACKEND == "osrm":
            result = await _route_osrm(lat1, lon1, lat2, lon2, client)
        elif settings.ROUTING_BACKEND == "ors":
            result = await _route_ors(lat1, lon1, lat2, lon2, client)
        else:
            raise ValueError(f"Backend de routing desconocido: {settings.ROUTING_BACKEND}")

        logger.debug(
            "Ruta calculada (%.1f km, %.0f min) con %s",
            result.distancia_km,
            result.duracion_min,
            settings.ROUTING_BACKEND,
        )
        return result

    except Exception as exc:
        logger.warning(
            "Error en routing backend '%s': %s – usando fallback haversine",
            settings.ROUTING_BACKEND,
            exc,
        )
        return _straight_line_route(lat1, lon1, lat2, lon2)
    finally:
        if own_client:
            await client.aclose()


async def get_detour_km(
    origin_lat: float,
    origin_lon: float,
    stop_lat: float,
    stop_lon: float,
    dest_lat: float,
    dest_lon: float,
    route_dist_km: float,
    client: Optional[httpx.AsyncClient] = None,
) -> float:
    """
    Calcula el desvío real en km para pasar por una parada intermedia.

    Estrategia de dos fases:
      1. Estimación rápida con haversine (A→S + S→B - A→B).
         Válida para pre-filtrar; sobreestima ligeramente en carretera.
      2. (Opcional) Cálculo exacto con el motor de routing si la estimación
         sitúa la gasolinera como candidata.

    Esta función siempre usa haversine para eficiencia (evita múltiples
    llamadas a la API de routing por cada candidato).
    """
    dist_a_s = haversine_km(origin_lat, origin_lon, stop_lat, stop_lon)
    dist_s_b = haversine_km(stop_lat, stop_lon, dest_lat, dest_lon)
    detour = dist_a_s + dist_s_b - route_dist_km
    return max(0.0, detour)
