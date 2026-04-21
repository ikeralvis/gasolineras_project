"""Lógica pura de filtrado y scoring para recomendaciones en ruta."""
from dataclasses import dataclass
from typing import List, Optional

from shapely.geometry import LineString, Point

from app.models.schemas import GasolineraInternal, RecomendacionRequest, RouteResult
from app.services.geo_math import (
    approx_road_detour_km,
    build_route_corridor,
    km_to_minutes,
    minutes_to_km,
    normalize_values,
    position_along_route,
)


SERVICE_AREA_BONUS = 0.08


@dataclass
class CandidateScore:
    station: GasolineraInternal
    precio: float
    desvio_km: float
    desvio_min: float
    detour_source: str
    service_area_bonus: float
    fraction: float
    pct: float
    dist_from_origin: float
    score: float = 0.0


def infer_service_area_bonus(station: GasolineraInternal) -> float:
    highway = (station.osm_highway or "").strip().lower()
    if station.es_area_servicio or highway in {"services", "rest_area"}:
        return SERVICE_AREA_BONUS

    text = f"{station.nombre or ''} {station.direccion or ''}".lower()
    if "area de servicio" in text or "service area" in text:
        return SERVICE_AREA_BONUS * 0.75

    return 0.0


def resolve_detour_budget(req: RecomendacionRequest, default_minutes: float, avg_speed_kmh: float) -> tuple[float, float, float]:
    """
    Calcula límites de desvío priorizando tiempo adicional de conducción.

    Retorna:
    - detour_limit_min: tiempo extra máximo permitido
    - detour_limit_km: límite efectivo en km (derivado de tiempo + cap por km de request)
    - prefilter_buffer_km: radio para prefiltrado geométrico
    """
    detour_limit_min = req.max_desvio_min if req.max_desvio_min is not None else default_minutes
    time_based_km = max(1.0, minutes_to_km(detour_limit_min, avg_speed_kmh))
    detour_limit_km = max(req.max_desvio_km, time_based_km)
    prefilter_buffer_km = min(max(8.0, time_based_km * 2.5), 60.0)
    return detour_limit_min, detour_limit_km, prefilter_buffer_km


def build_initial_candidates(
    *,
    req: RecomendacionRequest,
    route: RouteResult,
    stations: List[GasolineraInternal],
    avg_speed_kmh: float,
    road_factor: float,
    default_detour_minutes: float,
) -> tuple[list[CandidateScore], LineString, float, float, float]:
    """Genera candidatas iniciales con desvío aproximado y filtros básicos."""
    route_dist_km = route.distancia_km
    origin = req.origen
    dest = req.destino
    current_position = req.posicion_actual or origin

    detour_limit_min, detour_limit_km, prefilter_km = resolve_detour_budget(
        req,
        default_minutes=default_detour_minutes,
        avg_speed_kmh=avg_speed_kmh,
    )

    corridor = build_route_corridor(route.coordinates, prefilter_km)
    pre_candidates = [s for s in stations if corridor.contains(Point(s.lon, s.lat))]

    route_line = LineString(route.coordinates)
    current_progress = route_line.project(Point(current_position.lon, current_position.lat), normalized=True)

    enriched: list[CandidateScore] = []
    for station in pre_candidates:
        if not station.tiene_precio:
            continue

        detour_km = approx_road_detour_km(
            origin.lat,
            origin.lon,
            station.lat,
            station.lon,
            dest.lat,
            dest.lon,
            road_factor=road_factor,
        )

        detour_min = km_to_minutes(detour_km, avg_speed_kmh)
        if detour_min > detour_limit_min:
            continue
        if detour_km > detour_limit_km:
            continue

        fraction, pct, km_from_origin = position_along_route(
            route_line=route_line,
            station_lon=station.lon,
            station_lat=station.lat,
            route_dist_km=route_dist_km,
        )
        if fraction + 1e-6 < current_progress:
            continue

        enriched.append(
            CandidateScore(
                station=station,
                precio=station.precio,
                desvio_km=round(detour_km, 2),
                desvio_min=round(detour_min, 1),
                detour_source="approx",
                service_area_bonus=infer_service_area_bonus(station),
                fraction=fraction,
                pct=pct,
                dist_from_origin=km_from_origin,
            )
        )

    return enriched, route_line, current_progress, detour_limit_min, detour_limit_km


def filter_viable_candidates(
    candidates: list[CandidateScore],
    *,
    current_progress: float,
    detour_limit_min: float,
    detour_limit_km: float,
) -> list[CandidateScore]:
    return [
        item
        for item in candidates
        if item.fraction + 1e-6 >= current_progress
        and item.desvio_min <= detour_limit_min
        and item.desvio_km <= detour_limit_km
    ]


def score_candidates(candidates: list[CandidateScore], peso_precio: float, peso_desvio: float) -> list[CandidateScore]:
    if not candidates:
        return []

    price_norms = normalize_values([c.precio for c in candidates])
    detour_norms = normalize_values([c.desvio_km for c in candidates])

    for candidate, pn, dn in zip(candidates, price_norms, detour_norms):
        base_score = peso_precio * (1 - pn) + peso_desvio * (1 - dn)
        candidate.score = round(min(1.0, base_score + candidate.service_area_bonus), 4)

    return sorted(candidates, key=lambda c: c.score, reverse=True)


def summarize_prices(candidates: list[CandidateScore]) -> tuple[float, float, float]:
    if not candidates:
        return 0.0, 0.0, 0.0

    prices = [c.precio for c in candidates]
    return min(prices), max(prices), round(sum(prices) / len(prices), 3)


def build_stop_option_candidates(items: list):
    if not items:
        return []

    best_overall = max(items, key=lambda x: x.score)
    cheapest = min(items, key=lambda x: x.precio_litro)
    mid_trip = min(items, key=lambda x: abs(x.porcentaje_ruta - 50.0))
    shortest_detour = min(items, key=lambda x: x.desvio_km)

    options = []
    for candidate in [best_overall, cheapest, mid_trip, shortest_detour]:
        if candidate.posicion not in {o.posicion for o in options}:
            options.append(candidate)
        if len(options) == 4:
            break

    return options
