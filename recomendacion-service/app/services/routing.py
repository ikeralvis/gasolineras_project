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
from typing import Optional, List, Tuple

import httpx

from app.config import settings
from app.models.schemas import RouteResult

logger = logging.getLogger(__name__)


def _normalized_ors_key(raw_key: str) -> str:
    """Normaliza la API key de ORS para evitar errores por copiado/entorno."""
    key = (raw_key or "").strip().strip('"').strip("'")
    if not key:
        return ""

    # Las keys de ORS suelen ser base64-like; si falta padding, lo restauramos.
    # Esto corrige casos comunes en .env donde se pierde el '=' final.
    remainder = len(key) % 4
    if remainder:
        key = key + ("=" * (4 - remainder))
    return key


def _decode_polyline(polyline_str: str, precision: int = 5) -> List[List[float]]:
    """Decodifica polyline encoded a coordenadas [lon, lat]."""
    if not polyline_str:
        return []

    coords: List[List[float]] = []
    index = 0
    lat = 0
    lon = 0
    factor = 10 ** precision

    while index < len(polyline_str):
        shift = 0
        result = 0
        while True:
            b = ord(polyline_str[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        shift = 0
        result = 0
        while True:
            b = ord(polyline_str[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlon = ~(result >> 1) if (result & 1) else (result >> 1)
        lon += dlon

        coords.append([lon / factor, lat / factor])

    return coords


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
    evitar_peajes: bool = False,
) -> RouteResult:
    """
    Solicita ruta al backend OSRM.
    Documentación: http://project-osrm.org/docs/v5.24.0/api/
    Nota: La demo pública de OSRM no soporta de forma sencilla omitir peajes por URL.
    """
    return await _route_osrm_coords(
        coordinates=[(lon1, lat1), (lon2, lat2)],
        client=client,
    )


async def _route_osrm_coords(
    coordinates: List[Tuple[float, float]],
    client: httpx.AsyncClient,
) -> RouteResult:
    if len(coordinates) < 2:
        raise ValueError("OSRM requiere al menos dos coordenadas")

    coords_param = ";".join(f"{lon},{lat}" for lon, lat in coordinates)
    url = (
        f"{settings.OSRM_BASE_URL}/route/v1/driving/{coords_param}"
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
    evitar_peajes: bool = False,
) -> RouteResult:
    """
    Solicita ruta al backend OpenRouteService usando el endpoint POST.
    POST /v2/directions/driving-car
    Usa el header Authorization para la API key.
    """
    return await _route_ors_coords(
        coordinates=[(lon1, lat1), (lon2, lat2)],
        client=client,
        evitar_peajes=evitar_peajes,
    )


async def _route_ors_coords(
    coordinates: List[Tuple[float, float]],
    client: httpx.AsyncClient,
    evitar_peajes: bool = False,
) -> RouteResult:
    if len(coordinates) < 2:
        raise ValueError("ORS requiere al menos dos coordenadas")
    ors_key = _normalized_ors_key(settings.ORS_API_KEY)
    if not ors_key:
        raise ValueError("ORS_API_KEY no configurada. Añádela al .env.")

    url = f"{settings.ORS_BASE_URL}/v2/directions/driving-car"

    headers = {
        "Authorization": ors_key,
        "Accept": "application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8",
        "Content-Type": "application/json; charset=utf-8",
    }

    body = {
        "coordinates": [[lon, lat] for lon, lat in coordinates],
        "preference": "fastest",
        "units": "m",
        "geometry": True,
    }

    if evitar_peajes:
        body["options"] = {"avoid_features": ["tollways"]}

    resp = await client.post(url, json=body, headers=headers, timeout=settings.ROUTING_TIMEOUT_S)
    if not resp.is_success:
        detail = (resp.text or "")[:300]
        raise ValueError(f"ORS HTTP {resp.status_code}: {detail}")
    data = resp.json()

    if data.get("features"):
        feature = data["features"][0]
        summary = feature["properties"]["summary"]
        coords = feature["geometry"]["coordinates"]
    elif data.get("routes"):
        route = data["routes"][0]
        summary = route["summary"]
        geometry = route.get("geometry")

        if isinstance(geometry, dict) and geometry.get("coordinates"):
            coords = geometry["coordinates"]
        elif isinstance(geometry, str):
            coords = _decode_polyline(geometry)
        else:
            coords = []
    else:
        raise ValueError(f"Formato de respuesta ORS no reconocido: {list(data.keys())}")

    return RouteResult(
        distancia_m=summary["distance"],
        duracion_s=summary["duration"],
        coordinates=coords,
    )


def _backend_attempt_order() -> List[str]:
    preferred = settings.ROUTING_BACKEND
    if preferred == "ors":
        return ["ors", "osrm"] if settings.ROUTING_FAILOVER_TO_OSRM else ["ors"]
    return ["osrm", "ors"]


async def _route_with_backend(
    backend: str,
    coordinates: List[Tuple[float, float]],
    client: httpx.AsyncClient,
    evitar_peajes: bool = False,
) -> RouteResult:
    if backend == "osrm":
        return await _route_osrm_coords(coordinates, client)
    if backend == "ors":
        return await _route_ors_coords(coordinates, client, evitar_peajes)
    raise ValueError(f"Backend de routing desconocido: {backend}")


# ─────────────────────────────────────────────────────────────────────────────
# Punto de entrada principal
# ─────────────────────────────────────────────────────────────────────────────

async def get_route(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    evitar_peajes: bool = False,
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
        coordinates = [(lon1, lat1), (lon2, lat2)]
        last_exc: Optional[Exception] = None

        for backend in _backend_attempt_order():
            try:
                result = await _route_with_backend(backend, coordinates, client, evitar_peajes)
                logger.debug(
                    "Ruta calculada (%.1f km, %.0f min) con %s (evitar_peajes=%s)",
                    result.distancia_km,
                    result.duracion_min,
                    backend,
                    evitar_peajes,
                )
                return result
            except Exception as exc:
                last_exc = exc
                logger.warning("Backend %s no disponible: %s", backend, exc)

        if settings.ALLOW_STRAIGHT_LINE_FALLBACK:
            logger.warning(
                "Fallaron backends de routing (%s): usando fallback haversine",
                last_exc,
            )
            return _straight_line_route(lat1, lon1, lat2, lon2)

        raise RuntimeError(f"No se pudo calcular ruta con backends { _backend_attempt_order() }: {last_exc}")
    finally:
        if own_client:
            await client.aclose()


async def get_route_via_stop(
    origin_lat: float,
    origin_lon: float,
    stop_lat: float,
    stop_lon: float,
    dest_lat: float,
    dest_lon: float,
    evitar_peajes: bool = False,
    client: Optional[httpx.AsyncClient] = None,
) -> RouteResult:
    """Calcula la ruta real A→S→B con waypoints para estimar desvío exacto."""
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient()

    try:
        coordinates = [(origin_lon, origin_lat), (stop_lon, stop_lat), (dest_lon, dest_lat)]
        last_exc: Optional[Exception] = None

        for backend in _backend_attempt_order():
            try:
                return await _route_with_backend(backend, coordinates, client, evitar_peajes)
            except Exception as exc:
                last_exc = exc
                logger.warning("Backend %s no disponible para ruta con parada: %s", backend, exc)

        if settings.ALLOW_STRAIGHT_LINE_FALLBACK:
            logger.warning(
                "No se pudo calcular ruta A→S→B (%s): fallback haversine",
                last_exc,
            )
            dist_a_s = haversine_km(origin_lat, origin_lon, stop_lat, stop_lon)
            dist_s_b = haversine_km(stop_lat, stop_lon, dest_lat, dest_lon)
            speed_kmh = 80.0
            return RouteResult(
                distancia_m=(dist_a_s + dist_s_b) * 1000,
                duracion_s=((dist_a_s + dist_s_b) / speed_kmh) * 3600,
                coordinates=[
                    [origin_lon, origin_lat],
                    [stop_lon, stop_lat],
                    [dest_lon, dest_lat],
                ],
            )

        raise RuntimeError(f"No se pudo calcular ruta con parada con backends { _backend_attempt_order() }: {last_exc}")
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
