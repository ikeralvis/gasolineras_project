"""Servicios de routing con resiliencia, encapsulados en recomendacion-service."""
import asyncio
import logging
from typing import List, Optional, Tuple

import httpx

from app.config import settings
from app.models.schemas import RouteResult
from app.services.geo_math import haversine_km

logger = logging.getLogger(__name__)


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

            response.raise_for_status()
            return response
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
    key = (raw_key or "").strip().strip('"').strip("'")
    if not key:
        return ""
    remainder = len(key) % 4
    if remainder:
        key += "=" * (4 - remainder)
    return key


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

    body = {
        "coordinates": [[lon, lat] for lon, lat in coordinates],
        "preference": "fastest",
        "units": "m",
        "geometry": True,
    }
    if evitar_peajes:
        body["options"] = {"avoid_features": ["tollways"]}

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

    if not data.get("features"):
        raise ValueError(f"Formato ORS no reconocido: {list(data.keys())}")

    feature = data["features"][0]
    summary = feature["properties"]["summary"]
    return RouteResult(
        distancia_m=float(summary["distance"]),
        duracion_s=float(summary["duration"]),
        coordinates=feature["geometry"]["coordinates"],
    )


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
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient()

    try:
        coordinates = [(lon1, lat1), (lon2, lat2)]
        last_exc: Optional[Exception] = None
        for backend in _backend_attempt_order(evitar_peajes=evitar_peajes):
            try:
                return await _route_with_backend(backend, coordinates, client, evitar_peajes)
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
