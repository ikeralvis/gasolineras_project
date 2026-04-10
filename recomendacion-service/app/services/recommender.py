"""Nucleo de recomendacion de gasolineras en ruta."""
import asyncio
import logging
from typing import List, Optional, Tuple

from shapely.geometry import LineString, Point

from app.config import settings
from app.models.schemas import (
    Coordenada,
    EstadisticasRuta,
    GasolineraInternal,
    GasolineraResumen,
    GasolinerasDestacadas,
    RecomendacionItem,
    RecomendacionRequest,
    RecomendacionResponse,
    RouteResult,
    RutaBase,
)
from app.services.routing import get_detour_minutes_matrix, get_route_via_stop, haversine_km

logger = logging.getLogger(__name__)

AVG_SPEED_KMH = 80.0
ROAD_FACTOR = 1.3
SERVICE_AREA_BONUS = 0.08


def _build_route_corridor(coordinates: List[List[float]], buffer_km: float):
    if len(coordinates) < 2:
        lon, lat = coordinates[0]
        return Point(lon, lat).buffer(buffer_km / 111.0)

    line = LineString(coordinates)
    buffer_deg = buffer_km / 111.0
    return line.buffer(buffer_deg)


def _pre_filter(stations: List[GasolineraInternal], corridor) -> List[GasolineraInternal]:
    candidates = [s for s in stations if corridor.contains(Point(s.lon, s.lat))]
    logger.debug("Pre-filtrado: %d/%d en corredor", len(candidates), len(stations))
    return candidates


def _calc_detour(origin_lat: float, origin_lon: float, station_lat: float, station_lon: float, dest_lat: float, dest_lon: float) -> float:
    dist_a_s = haversine_km(origin_lat, origin_lon, station_lat, station_lon)
    dist_s_b = haversine_km(station_lat, station_lon, dest_lat, dest_lon)
    dist_a_b = haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)
    detour_straight = max(0.0, (dist_a_s + dist_s_b) - dist_a_b)
    return detour_straight * ROAD_FACTOR


def _position_along_route(station_lon: float, station_lat: float, route_line: LineString, route_dist_km: float) -> Tuple[float, float, float]:
    fraction = route_line.project(Point(station_lon, station_lat), normalized=True)
    pct = fraction * 100.0
    return fraction, round(pct, 1), round(fraction * route_dist_km, 2)


def _normalize(values: List[float]) -> List[float]:
    min_v, max_v = min(values), max(values)
    if max_v == min_v:
        return [0.5] * len(values)
    return [(v - min_v) / (max_v - min_v) for v in values]


def _service_area_bonus(station: GasolineraInternal) -> float:
    highway = (station.osm_highway or "").strip().lower()
    if highway in {"services", "rest_area"}:
        return SERVICE_AREA_BONUS

    text = f"{station.nombre or ''} {station.direccion or ''}".lower()
    if "area de servicio" in text or "service area" in text:
        return SERVICE_AREA_BONUS * 0.75
    return 0.0


def _score_candidates(candidates: List[dict], peso_precio: float, peso_desvio: float) -> List[dict]:
    if not candidates:
        return []

    prices = [c["precio"] for c in candidates]
    detours = [c["desvio_km"] for c in candidates]

    price_norms = _normalize(prices)
    detour_norms = _normalize(detours)

    for c, pn, dn in zip(candidates, price_norms, detour_norms):
        base_score = peso_precio * (1 - pn) + peso_desvio * (1 - dn)
        c["score"] = round(min(1.0, base_score + c.get("service_area_bonus", 0.0)), 4)

    return sorted(candidates, key=lambda x: x["score"], reverse=True)


def _build_stop_options(items: List[RecomendacionItem]) -> List[RecomendacionItem]:
    if not items:
        return []

    best_overall = max(items, key=lambda x: x.score)
    cheapest = min(items, key=lambda x: x.precio_litro)
    mid_trip = min(items, key=lambda x: abs(x.porcentaje_ruta - 50.0))
    shortest_detour = min(items, key=lambda x: x.desvio_km)

    options: List[RecomendacionItem] = []
    for candidate in [best_overall, cheapest, mid_trip, shortest_detour]:
        if candidate.posicion not in {o.posicion for o in options}:
            options.append(candidate)
        if len(options) == 4:
            break

    return options


async def _apply_matrix_detour_minutes(req: RecomendacionRequest, origin: Coordenada, dest: Coordenada, enriched: List[dict]) -> None:
    if not enriched:
        return

    sorted_by_approx = sorted(enriched, key=lambda c: (c["desvio_min"], c["precio"]))
    matrix_pool = sorted_by_approx[: settings.MATRIX_MAX_CANDIDATES]
    matrix_coords = [(item["station"].lon, item["station"].lat) for item in matrix_pool]

    matrix_detours = await get_detour_minutes_matrix(
        origin_lat=origin.lat,
        origin_lon=origin.lon,
        dest_lat=dest.lat,
        dest_lon=dest.lon,
        candidates=matrix_coords,
        evitar_peajes=req.evitar_peajes,
    )

    for item, detour_min in zip(matrix_pool, matrix_detours):
        if detour_min is None:
            continue
        item["desvio_min"] = round(detour_min, 1)
        item["desvio_km"] = round((detour_min / 60.0) * AVG_SPEED_KMH, 2)


async def _refine_exact_detours(req: RecomendacionRequest, origin: Coordenada, dest: Coordenada, route_dist_km: float, enriched: List[dict]) -> None:
    if not enriched:
        return

    refine_limit = min(len(enriched), max(settings.MAX_REAL_DETOUR_CHECKS, req.top_n))
    refine_pool = sorted(enriched, key=lambda c: (c["desvio_min"], c["precio"]))[:refine_limit]
    semaphore = asyncio.Semaphore(8)

    async def _refine(item: dict):
        async with semaphore:
            station: GasolineraInternal = item["station"]
            try:
                via_route = await get_route_via_stop(
                    origin_lat=origin.lat,
                    origin_lon=origin.lon,
                    stop_lat=station.lat,
                    stop_lon=station.lon,
                    dest_lat=dest.lat,
                    dest_lon=dest.lon,
                    evitar_peajes=req.evitar_peajes,
                )
                real_detour_km = max(0.0, via_route.distancia_km - route_dist_km)
                item["desvio_km"] = round(real_detour_km, 2)
                item["desvio_min"] = round((real_detour_km / AVG_SPEED_KMH) * 60, 1)
            except Exception:
                return

    await asyncio.gather(*[_refine(item) for item in refine_pool], return_exceptions=True)


async def build_recommendations(req: RecomendacionRequest, route: RouteResult, stations: List[GasolineraInternal]) -> RecomendacionResponse:
    route_dist_km = route.distancia_km
    origin = req.origen
    dest = req.destino
    current_position = req.posicion_actual or origin

    pre_filter_km = min(req.max_desvio_km * 3, 50.0)
    corridor = _build_route_corridor(route.coordinates, pre_filter_km)
    pre_candidates = _pre_filter(stations, corridor)

    route_line = LineString(route.coordinates)
    current_progress = route_line.project(Point(current_position.lon, current_position.lat), normalized=True)

    enriched: List[dict] = []
    for station in pre_candidates:
        if not station.tiene_precio:
            continue

        detour_km = _calc_detour(origin.lat, origin.lon, station.lat, station.lon, dest.lat, dest.lon)
        if detour_km > req.max_desvio_km:
            continue

        fraction, pct, dist_from_origin = _position_along_route(station.lon, station.lat, route_line, route_dist_km)
        if fraction + 1e-6 < current_progress:
            continue

        detour_min = round((detour_km / AVG_SPEED_KMH) * 60, 1)
        if req.max_desvio_min is not None and detour_min > req.max_desvio_min:
            continue

        enriched.append(
            {
                "station": station,
                "precio": station.precio,
                "desvio_km": round(detour_km, 2),
                "desvio_min": detour_min,
                "service_area_bonus": _service_area_bonus(station),
                "fraction": fraction,
                "pct": pct,
                "dist_from_origin": dist_from_origin,
            }
        )

    await _apply_matrix_detour_minutes(req, origin, dest, enriched)
    await _refine_exact_detours(req, origin, dest, route_dist_km, enriched)

    enriched = [
        item
        for item in enriched
        if item["fraction"] + 1e-6 >= current_progress
        and item["desvio_km"] <= req.max_desvio_km
        and (req.max_desvio_min is None or item["desvio_min"] <= req.max_desvio_min)
    ]

    scored = _score_candidates(enriched, req.peso_precio, req.peso_desvio)
    top = scored[: req.top_n]

    all_prices = [c["precio"] for c in enriched] if enriched else [0.0]
    precio_min = min(all_prices)
    precio_max = max(all_prices)
    precio_medio = round(sum(all_prices) / len(all_prices), 3) if all_prices else 0.0

    items: List[RecomendacionItem] = []
    for i, candidate in enumerate(top, start=1):
        station: GasolineraInternal = candidate["station"]

        ahorro = None
        if req.litros_deposito and precio_max > candidate["precio"]:
            ahorro = round((precio_max - candidate["precio"]) * req.litros_deposito, 2)

        dif_vs_barata = None
        if len(all_prices) > 1:
            dif_vs_barata = round(candidate["precio"] - precio_min, 3)

        items.append(
            RecomendacionItem(
                posicion=i,
                gasolinera=GasolineraResumen(
                    id=station.id,
                    nombre=station.nombre,
                    direccion=station.direccion,
                    municipio=station.municipio,
                    provincia=station.provincia,
                    lat=station.lat,
                    lon=station.lon,
                    horario=station.horario,
                ),
                precio_litro=candidate["precio"],
                desvio_km=candidate["desvio_km"],
                desvio_min_estimado=candidate["desvio_min"],
                distancia_desde_origen_km=candidate["dist_from_origin"],
                porcentaje_ruta=candidate["pct"],
                score=candidate["score"],
                ahorro_vs_mas_cara_eur=ahorro,
                diferencia_vs_mas_barata_eur_litro=dif_vs_barata,
            )
        )

    destacadas = GasolinerasDestacadas(
        mejor_puntuada=items[0] if items else None,
        mas_barata=min(items, key=lambda x: x.precio_litro) if items else None,
        mas_cercana=min(items, key=lambda x: x.desvio_km) if items else None,
    )

    return RecomendacionResponse(
        ruta_base=RutaBase(
            distancia_km=round(route_dist_km, 2),
            duracion_min=round(route.duracion_min, 1),
            coordinates=route.coordinates,
            origen=Coordenada(lat=origin.lat, lon=origin.lon, nombre=origin.nombre),
            destino=Coordenada(lat=dest.lat, lon=dest.lon, nombre=dest.nombre),
        ),
        estadisticas=EstadisticasRuta(
            candidatos_evaluados=len(enriched),
            precio_medio=precio_medio,
            precio_min=precio_min,
            precio_max=precio_max,
            combustible=req.combustible,
        ),
        destacadas=destacadas,
        recomendaciones=items,
        opciones_parada=_build_stop_options(items),
        metadata={},
        geojson={
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": route.coordinates},
                    "properties": {
                        "feature_type": "route",
                        "distancia_km": round(route_dist_km, 2),
                        "duracion_min": round(route.duracion_min, 1),
                    },
                },
                *[
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [item.gasolinera.lon, item.gasolinera.lat]},
                        "properties": {
                            "feature_type": "gas_station",
                            "ranking": item.posicion,
                            "nombre": item.gasolinera.nombre,
                            "precio_litro": item.precio_litro,
                            "desvio_km": item.desvio_km,
                            "desvio_min_estimado": item.desvio_min_estimado,
                            "score": item.score,
                            "porcentaje_ruta": item.porcentaje_ruta,
                        },
                    }
                    for item in items
                ],
            ],
        },
    )
