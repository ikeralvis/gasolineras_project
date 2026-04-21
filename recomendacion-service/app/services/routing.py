"""Servicios de routing con resiliencia, encapsulados en recomendacion-service."""
import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.config import settings
from app.models.schemas import RouteResult
from app.services.geo_math import haversine_km

logger = logging.getLogger(__name__)

# Semáforo global: máx 4 llamadas ORS concurrentes (plan free: ~40 req/min)
_ors_semaphore = asyncio.Semaphore(4)

# Caché de rutas directas A→B (TTL 1 hora). Evita recalcular rutas frecuentes.
_route_cache: Dict[str, tuple] = {}
_ROUTE_CACHE_TTL_S = 3600.0
_ROUTE_CACHE_MAX_ENTRIES = 500


def _route_cache_key(lat1: float, lon1: float, lat2: float, lon2: float, evitar_peajes: bool) -> str:
    return f"{lat1:.5f},{lon1:.5f},{lat2:.5f},{lon2:.5f},{int(evitar_peajes)}"


def _get_cached_route(key: str) -> Optional[RouteResult]:
    entry = _route_cache.get(key)
    if entry is None:
        return None
    ts, result = entry
    if time.monotonic() - ts > _ROUTE_CACHE_TTL_S:
        _route_cache.pop(key, None)
        return None
    return result


def _cache_route(key: str, result: RouteResult) -> None:
    _route_cache[key] = (time.monotonic(), result)
    if len(_route_cache) > _ROUTE_CACHE_MAX_ENTRIES:
        cutoff = time.monotonic() - _ROUTE_CACHE_TTL_S
        stale = [k for k, (ts, _) in list(_route_cache.items()) if ts < cutoff]
        for k in stale:
            _route_cache.pop(k, None)


def _read_polyline_component(polyline: str, index: int) -> tuple[int, int]:
    result = 0
    shift = 0

    while index < len(polyline):
        value = ord(polyline[index]) - 63
        index += 1
        result |= (value & 0x1F) << shift
        shift += 5
        if value < 0x20:
            delta = ~(result >> 1) if (result & 1) else (result >> 1)
            return delta, index

    raise ValueError("polyline-incompleta")


def _decode_polyline(polyline: str, precision: int = 5) -> list[list[float]]:
    """Decodifica polyline encoded (Google/ORS) a coordenadas [lon, lat]."""
    if not polyline:
        return []

    coordinates: list[list[float]] = []
    index = 0
    lat = 0
    lon = 0
    factor = 10 ** precision

    try:
        while index < len(polyline):
            delta_lat, index = _read_polyline_component(polyline, index)
            delta_lon, index = _read_polyline_component(polyline, index)
            lat += delta_lat
            lon += delta_lon
            coordinates.append([lon / factor, lat / factor])
    except ValueError:
        # Si la geometría llega truncada devolvemos lo decodificado hasta ahora.
        return coordinates

    return coordinates


def _extract_ors_coordinates(route: dict[str, Any]) -> list[list[float]]:
    geometry = route.get("geometry")

    if isinstance(geometry, dict):
        coords = geometry.get("coordinates")
        if isinstance(coords, list):
            return coords

    if isinstance(geometry, list):
        return geometry

    if isinstance(geometry, str):
        return _decode_polyline(geometry)

    return []


def _extract_ors_summary(route: dict[str, Any]) -> tuple[float, float]:
    summary = route.get("summary") or {}
    distance = summary.get("distance")
    duration = summary.get("duration")

    if distance is not None and duration is not None:
        return float(distance), float(duration)

    # Fallback defensivo por si ORS devuelve segmentos sin summary global.
    segments = route.get("segments")
    if isinstance(segments, list) and segments:
        total_distance = sum(float((segment or {}).get("distance") or 0) for segment in segments)
        total_duration = sum(float((segment or {}).get("duration") or 0) for segment in segments)
        if total_distance > 0 and total_duration > 0:
            return total_distance, total_duration

    raise ValueError("ORS route sin summary de distancia/duracion")


def _parse_ors_feature(data: dict[str, Any]) -> Optional[RouteResult]:
    features = data.get("features")
    if isinstance(features, list) and features:
        feature = features[0]
        summary = ((feature or {}).get("properties") or {}).get("summary") or {}
        coordinates = ((feature or {}).get("geometry") or {}).get("coordinates") or []

        if coordinates and summary.get("distance") is not None and summary.get("duration") is not None:
            return RouteResult(
                distancia_m=float(summary["distance"]),
                duracion_s=float(summary["duration"]),
                coordinates=coordinates,
            )

    return None


def _parse_ors_routes(data: dict[str, Any]) -> RouteResult:
    routes = data.get("routes")
    if routes is None:
        raise ValueError(
            "ORS devolvió routes=null. Puede que las coordenadas sean inalcanzables "
            f"o el perfil no tenga ruta. Claves: {list(data.keys())}"
        )
    if not isinstance(routes, list) or not routes:
        raise ValueError(f"ORS devolvió routes vacío o con formato inesperado: {routes!r}")

    route = routes[0] or {}
    distance_m, duration_s = _extract_ors_summary(route)
    coordinates = _extract_ors_coordinates(route)
    if not coordinates:
        raise ValueError("Respuesta ORS sin geometría útil en route[0]")

    return RouteResult(
        distancia_m=distance_m,
        duracion_s=duration_s,
        coordinates=coordinates,
    )


def _parse_ors_route(data: dict[str, Any]) -> RouteResult:
    # Formato GeoJSON FeatureCollection (endpoint GET)
    if "features" in data:
        parsed = _parse_ors_feature(data)
        if parsed is not None:
            return parsed
        raise ValueError("ORS GeoJSON FeatureCollection sin features válidas")

    # Formato routes[] (endpoint POST v2) — incluye {bbox, routes, metadata}
    if "routes" in data:
        return _parse_ors_routes(data)

    raise ValueError(f"Formato ORS no reconocido: {list(data.keys())}")


def _straight_line_route(lat1: float, lon1: float, lat2: float, lon2: float) -> RouteResult:
    dist_km = haversine_km(lat1, lon1, lat2, lon2)
    speed_kmh = 90.0
    return RouteResult(
        distancia_m=dist_km * 1000,
        duracion_s=(dist_km / speed_kmh) * 3600,
        coordinates=[[lon1, lat1], [lon2, lat2]],
    )


def _is_retryable_status(status_code: int) -> bool:
    return status_code in {408, 425, 429, 500, 502, 503, 504}


def _normalize_backend(backend: Optional[str]) -> str:
    selected = (backend or settings.ROUTING_BACKEND).strip().lower()
    if selected not in {"ors", "osrm"}:
        raise ValueError(f"Backend de routing desconocido: {selected}")
    return selected


def _supports_toll_avoidance(backend: str) -> bool:
    return backend == "ors"


def _retry_backoff_seconds(attempt: int) -> float:
    return settings.ROUTING_RETRY_BACKOFF_S * (2 ** attempt)


def _response_retry_wait_seconds(response: httpx.Response, attempt: int) -> float:
    retry_after = response.headers.get("Retry-After")
    if retry_after and retry_after.isdigit():
        return float(retry_after)
    return _retry_backoff_seconds(attempt)


def _provider_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except Exception:
        payload = None

    if isinstance(payload, dict):
        detail = payload.get("error") or payload.get("message") or payload.get("details")
        if detail:
            return str(detail)

    text = (response.text or "").strip()
    if text:
        return text[:400]

    return "sin detalle"


async def _request_with_retries(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    json: Optional[dict] = None,
    headers: Optional[dict] = None,
    timeout_s: Optional[float] = None,
) -> httpx.Response:
    retries = max(0, settings.ROUTING_HTTP_RETRIES)
    timeout = timeout_s or settings.ROUTING_TIMEOUT_S
    last_exc: Optional[Exception] = None

    for attempt in range(retries + 1):
        try:
            response = await client.request(
                method=method,
                url=url,
                json=json,
                headers=headers,
                timeout=timeout,
            )

            if response.is_success:
                return response

            if attempt < retries and _is_retryable_status(response.status_code):
                await asyncio.sleep(_response_retry_wait_seconds(response, attempt))
                continue

            detail = _provider_error_detail(response)
            last_exc = RuntimeError(f"HTTP {response.status_code} en {url}: {detail}")
            break
        except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as exc:
            last_exc = exc
            if attempt >= retries:
                break
            await asyncio.sleep(_retry_backoff_seconds(attempt))

    raise RuntimeError(f"Fallo HTTP hacia motor de routing tras reintentos: {last_exc}")


async def _route_osrm_coords(coordinates: List[Tuple[float, float]], client: httpx.AsyncClient) -> RouteResult:
    if len(coordinates) < 2:
        raise ValueError("OSRM requiere al menos dos coordenadas")

    coords_param = ";".join(f"{lon},{lat}" for lon, lat in coordinates)
    url = f"{settings.OSRM_BASE_URL}/route/v1/driving/{coords_param}?overview=full&geometries=geojson&steps=false"
    response = await _request_with_retries(client, "GET", url)
    data = response.json()

    if data.get("code") != "Ok" or not data.get("routes"):
        raise ValueError(f"OSRM devolvio codigo inesperado: {data.get('code')}")

    route = data["routes"][0]
    return RouteResult(
        distancia_m=float(route["distance"]),
        duracion_s=float(route["duration"]),
        coordinates=route["geometry"]["coordinates"],
    )


def _normalized_ors_key(raw_key: str) -> str:
    return (raw_key or "").strip().strip('"').strip("'")


async def _route_ors_coords(
    coordinates: List[Tuple[float, float]],
    client: httpx.AsyncClient,
    evitar_peajes: bool = False,
) -> RouteResult:
    if len(coordinates) < 2:
        raise ValueError("ORS requiere al menos dos coordenadas")

    ors_key = _normalized_ors_key(settings.ORS_API_KEY)
    if not ors_key:
        raise ValueError("ORS_API_KEY no configurada")

    body: dict = {
        "coordinates": [[lon, lat] for lon, lat in coordinates],  # ORS: [lon, lat]
        "preference": "fastest",
        "units": "m",
        "geometry": True,
        "geometry_format": "geojson",
        "instructions": True,
        "extra_info": ["avgspeed"],
    }
    if evitar_peajes:
        body["options"] = {"avoid_features": ["tollways"]}

    async with _ors_semaphore:
        response = await _request_with_retries(
            client,
            "POST",
            f"{settings.ORS_BASE_URL}/v2/directions/driving-car",
            json=body,
            headers={
                "Authorization": ors_key,
                "Content-Type": "application/json; charset=utf-8",
            },
        )
    data = response.json()
    return _parse_ors_route(data)


async def _matrix_ors(
    coordinates: List[Tuple[float, float]],
    sources: List[int],
    destinations: List[int],
    client: httpx.AsyncClient,
    evitar_peajes: bool = False,
) -> List[List[Optional[float]]]:
    ors_key = _normalized_ors_key(settings.ORS_API_KEY)
    if not ors_key:
        raise ValueError("ORS_API_KEY no configurada")

    body = {
        "locations": [[lon, lat] for lon, lat in coordinates],
        "sources": sources,
        "destinations": destinations,
        "metrics": ["duration"],
    }
    if evitar_peajes:
        body["options"] = {"avoid_features": ["tollways"]}

    async with _ors_semaphore:
        response = await _request_with_retries(
            client,
            "POST",
            f"{settings.ORS_BASE_URL}/v2/matrix/driving-car",
            json=body,
            headers={
                "Authorization": ors_key,
                "Content-Type": "application/json; charset=utf-8",
            },
        )
    data = response.json()
    durations = data.get("durations")
    if not isinstance(durations, list):
        raise ValueError("Respuesta ORS matrix no valida")
    return durations


async def get_route_by_coordinates(
    coordinates: List[Tuple[float, float]],
    *,
    backend: Optional[str] = None,
    evitar_peajes: bool = False,
    client: Optional[httpx.AsyncClient] = None,
) -> Tuple[str, RouteResult]:
    selected_backend = _normalize_backend(backend)

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient()

    try:
        if selected_backend == "osrm":
            return "osrm", await _route_osrm_coords(coordinates, client)
        return "ors", await _route_ors_coords(coordinates, client, evitar_peajes)
    finally:
        if own_client and client is not None:
            await client.aclose()


async def get_matrix_durations(
    coordinates: List[Tuple[float, float]],
    sources: List[int],
    destinations: List[int],
    *,
    backend: Optional[str] = None,
    evitar_peajes: bool = False,
    client: Optional[httpx.AsyncClient] = None,
) -> Tuple[str, List[List[Optional[float]]]]:
    selected_backend = _normalize_backend(backend)
    if selected_backend != "ors":
        raise ValueError("matrix actualmente soportada solo con backend ORS")

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient()

    try:
        durations = await _matrix_ors(
            coordinates=coordinates,
            sources=sources,
            destinations=destinations,
            client=client,
            evitar_peajes=evitar_peajes,
        )
        return "ors", durations
    finally:
        if own_client and client is not None:
            await client.aclose()


def _backend_attempt_order(*, evitar_peajes: bool = False) -> List[str]:
    if settings.ROUTING_BACKEND == "ors":
        ordered = ["ors", "osrm"] if settings.ROUTING_FAILOVER_TO_OSRM else ["ors"]
    else:
        ordered = ["osrm", "ors"]

    if not evitar_peajes:
        return ordered

    # Evita degradar silenciosamente a un backend que no soporta peajes.
    toll_capable = [backend for backend in ordered if _supports_toll_avoidance(backend)]
    return toll_capable or ["ors"]


async def _route_with_backend(
    backend: str,
    coordinates: List[Tuple[float, float]],
    client: httpx.AsyncClient,
    evitar_peajes: bool,
) -> RouteResult:
    if backend == "osrm":
        if evitar_peajes:
            raise ValueError("OSRM no soporta evitar peajes")
        return await _route_osrm_coords(coordinates, client)
    if backend == "ors":
        return await _route_ors_coords(coordinates, client, evitar_peajes)
    raise ValueError(f"Backend de routing desconocido: {backend}")


async def get_route(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    evitar_peajes: bool = False,
    client: Optional[httpx.AsyncClient] = None,
) -> RouteResult:
    cache_key = _route_cache_key(lat1, lon1, lat2, lon2, evitar_peajes)
    cached = _get_cached_route(cache_key)
    if cached is not None:
        logger.debug("Ruta A→B devuelta desde caché: %s", cache_key)
        return cached

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient()

    try:
        coordinates = [(lon1, lat1), (lon2, lat2)]
        last_exc: Optional[Exception] = None
        for backend in _backend_attempt_order(evitar_peajes=evitar_peajes):
            try:
                result = await _route_with_backend(backend, coordinates, client, evitar_peajes)
                _cache_route(cache_key, result)
                return result
            except Exception as exc:
                last_exc = exc
                logger.warning("Backend routing %s no disponible: %s", backend, exc)

        if settings.ALLOW_STRAIGHT_LINE_FALLBACK:
            logger.warning("Usando fallback linea recta por error de routing: %s", last_exc)
            return _straight_line_route(lat1, lon1, lat2, lon2)

        raise RuntimeError(f"No se pudo calcular ruta A->B: {last_exc}")
    finally:
        if own_client and client is not None:
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
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient()

    try:
        coordinates = [(origin_lon, origin_lat), (stop_lon, stop_lat), (dest_lon, dest_lat)]
        last_exc: Optional[Exception] = None
        for backend in _backend_attempt_order(evitar_peajes=evitar_peajes):
            try:
                return await _route_with_backend(backend, coordinates, client, evitar_peajes)
            except Exception as exc:
                last_exc = exc
                logger.warning("Ruta A->S->B fallo con backend %s: %s", backend, exc)

        if settings.ALLOW_STRAIGHT_LINE_FALLBACK:
            dist_a_s = haversine_km(origin_lat, origin_lon, stop_lat, stop_lon)
            dist_s_b = haversine_km(stop_lat, stop_lon, dest_lat, dest_lon)
            speed_kmh = 80.0
            return RouteResult(
                distancia_m=(dist_a_s + dist_s_b) * 1000,
                duracion_s=((dist_a_s + dist_s_b) / speed_kmh) * 3600,
                coordinates=[[origin_lon, origin_lat], [stop_lon, stop_lat], [dest_lon, dest_lat]],
            )

        raise RuntimeError(f"No se pudo calcular ruta A->S->B: {last_exc}")
    finally:
        if own_client and client is not None:
            await client.aclose()


async def get_detour_minutes_matrix(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    candidates: List[Tuple[float, float]],
    evitar_peajes: bool = False,
    client: Optional[httpx.AsyncClient] = None,
) -> List[Optional[float]]:
    """Calcula desvio en minutos con Matrix API en una sola llamada."""
    if not candidates:
        return []

    should_try_ors_matrix = (
        settings.ROUTING_BACKEND == "ors"
        or settings.ROUTING_FAILOVER_TO_OSRM
        or evitar_peajes
    )
    if not should_try_ors_matrix:
        return [None] * len(candidates)

    capped = candidates[: settings.MATRIX_MAX_CANDIDATES]
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient()

    try:
        coordinates, sources, destinations, candidate_indices = _build_matrix_inputs(
            origin_lon=origin_lon,
            origin_lat=origin_lat,
            dest_lon=dest_lon,
            dest_lat=dest_lat,
            capped=capped,
        )

        _, matrix = await get_matrix_durations(
            coordinates=coordinates,
            sources=sources,
            destinations=destinations,
            backend="ors",
            client=client,
            evitar_peajes=evitar_peajes,
        )

        return _compute_detours_from_matrix(
            matrix=matrix,
            candidate_indices=candidate_indices,
            total_candidates=len(candidates),
            capped_count=len(capped),
        )
    except Exception as exc:
        logger.warning("Matrix API no disponible, fallback a calculo individual: %s", exc)
        return [None] * len(candidates)
    finally:
        if own_client and client is not None:
            await client.aclose()


def _build_matrix_inputs(
    origin_lon: float,
    origin_lat: float,
    dest_lon: float,
    dest_lat: float,
    capped: List[Tuple[float, float]],
) -> Tuple[List[Tuple[float, float]], List[int], List[int], List[int]]:
    coordinates: List[Tuple[float, float]] = [(origin_lon, origin_lat)]
    coordinates.extend(capped)
    dest_index = len(coordinates)
    coordinates.append((dest_lon, dest_lat))

    candidate_indices = list(range(1, 1 + len(capped)))
    sources = [0] + candidate_indices
    destinations = candidate_indices + [dest_index]
    return coordinates, sources, destinations, candidate_indices


def _compute_detours_from_matrix(
    matrix: List[List[Optional[float]]],
    candidate_indices: List[int],
    total_candidates: int,
    capped_count: int,
) -> List[Optional[float]]:
    if not matrix:
        return [None] * total_candidates

    ab_duration = matrix[0][-1]
    if ab_duration is None:
        return [None] * total_candidates

    detours: List[Optional[float]] = []
    for i, _candidate_index in enumerate(candidate_indices):
        a_to_s = matrix[0][i] if i < len(matrix[0]) else None
        s_to_b = matrix[i + 1][-1] if i + 1 < len(matrix) else None
        if a_to_s is None or s_to_b is None:
            detours.append(None)
            continue
        detours.append(max(0.0, (a_to_s + s_to_b - ab_duration) / 60.0))

    if total_candidates > capped_count:
        detours.extend([None] * (total_candidates - capped_count))
    return detours
