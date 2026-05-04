"""Orquestador de recomendación en ruta: I/O de routing + núcleo puro de scoring."""
import asyncio
import logging
from typing import List

import httpx

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
from app.services.poi_access import infer_access_from_osm
from app.services.recommendation_core import (
    CandidateScore,
    build_initial_candidates,
    build_stop_option_candidates,
    filter_viable_candidates,
    score_candidates,
    summarize_prices,
)
from app.services.routing import get_detour_minutes_matrix, get_route_via_stop

logger = logging.getLogger(__name__)

AVG_SPEED_KMH = 80.0
ROAD_FACTOR = 1.3
HIGHWAY_ACCESS_CATEGORIES = {"service_area", "highway_exit"}


async def _apply_matrix_detour_minutes(
    req: RecomendacionRequest,
    origin: Coordenada,
    dest: Coordenada,
    enriched: List[CandidateScore],
) -> tuple[bool, bool]:
    if not enriched:
        return False, False

    sorted_by_approx = sorted(enriched, key=lambda c: (c.desvio_min, c.precio))
    matrix_pool = sorted_by_approx[: settings.MATRIX_MAX_CANDIDATES]
    matrix_coords = [(item.station.lon, item.station.lat) for item in matrix_pool]

    detour_minutes, detour_km, matrix_failed, had_nulls = await get_detour_minutes_matrix(
        origin_lat=origin.lat,
        origin_lon=origin.lon,
        dest_lat=dest.lat,
        dest_lon=dest.lon,
        candidates=matrix_coords,
        evitar_peajes=req.evitar_peajes,
    )

    if req.evitar_peajes and (matrix_failed or had_nulls):
        return matrix_failed, had_nulls

    for item, detour_min, detour_km_value in zip(matrix_pool, detour_minutes, detour_km):
        if detour_min is None or detour_km_value is None:
            continue
        item.desvio_min = round(detour_min, 1)
        item.desvio_km = round(detour_km_value, 2)
        item.detour_source = "matrix"

    return matrix_failed, had_nulls


async def _refine_exact_detours(
    req: RecomendacionRequest,
    origin: Coordenada,
    dest: Coordenada,
    route_dist_km: float,
    route_duration_min: float,
    enriched: List[CandidateScore],
    limit: int,
    refine_by_price: bool = False,
) -> None:
    if not enriched:
        return

    refine_limit = min(len(enriched), max(1, limit))
    if refine_by_price:
        refine_pool = sorted(enriched, key=lambda c: (c.precio, c.desvio_min))[:refine_limit]
    else:
        refine_pool = sorted(enriched, key=lambda c: (c.desvio_min, c.precio))[:refine_limit]
    semaphore = asyncio.Semaphore(8)

    async with httpx.AsyncClient() as client:
        async def _refine(item: CandidateScore):
            async with semaphore:
                station = item.station
                try:
                    via_route = await get_route_via_stop(
                        origin_lat=origin.lat,
                        origin_lon=origin.lon,
                        stop_lat=station.lat,
                        stop_lon=station.lon,
                        dest_lat=dest.lat,
                        dest_lon=dest.lon,
                        evitar_peajes=req.evitar_peajes,
                        client=client,
                    )
                    real_detour_km = max(0.0, via_route.distancia_km - route_dist_km)
                    real_detour_min = max(0.0, via_route.duracion_min - route_duration_min)
                    item.desvio_km = round(real_detour_km, 2)
                    item.desvio_min = round(real_detour_min, 1)
                    item.detour_source = "exact"
                except Exception as exc:
                    logger.warning(
                        "No se pudo refinar desvío exacto para '%s' (lat=%.5f, lon=%.5f): %s",
                        station.nombre or station.id,
                        station.lat,
                        station.lon,
                        exc,
                    )

        await asyncio.gather(*[_refine(item) for item in refine_pool], return_exceptions=True)


def _apply_osm_access_inference(candidates: List[CandidateScore]) -> None:
    for item in candidates:
        if item.station.access_category:
            continue
        classification = infer_access_from_osm(item.station)
        item.station.access_category = classification["category"]
        item.station.access_source = classification["source"]
        item.station.access_confidence = round(classification["confidence"], 2)


def _apply_access_policy(candidates: List[CandidateScore]) -> List[CandidateScore]:
    mode = settings.ACCESS_FILTER_MODE
    if mode == "off":
        return candidates

    if mode == "prefer":
        return sorted(
            candidates,
            key=lambda c: (
                0 if c.station.access_category in HIGHWAY_ACCESS_CATEGORIES else 1,
                -c.score,
            ),
        )

    strict_candidates = [
        item for item in candidates if item.station.access_category in HIGHWAY_ACCESS_CATEGORIES
    ]
    if strict_candidates:
        return strict_candidates

    # Fallback de seguridad para no dejar al usuario sin opciones.
    return candidates


async def build_recommendations(
    req: RecomendacionRequest,
    route: RouteResult,
    stations: List[GasolineraInternal],
    *,
    prefiltered: bool = False,
) -> RecomendacionResponse:
    route_dist_km = route.distancia_km
    route_duration_min = route.duracion_min
    route_avg_speed_kmh = AVG_SPEED_KMH
    if route_duration_min > 0.1:
        route_avg_speed_kmh = max(30.0, min(130.0, route_dist_km / (route_duration_min / 60.0)))

    origin = req.origen
    dest = req.destino

    (
        enriched,
        _,
        current_progress,
        detour_limit_min,
        detour_limit_km,
    ) = build_initial_candidates(
        req=req,
        route=route,
        stations=stations,
        avg_speed_kmh=route_avg_speed_kmh,
        road_factor=ROAD_FACTOR,
        default_detour_minutes=settings.DEFAULT_MAX_DESVIO_MIN,
        prefiltered=prefiltered,
    )

    matrix_failed, matrix_nulls = await _apply_matrix_detour_minutes(req, origin, dest, enriched)
    skip_matrix_for_tolls = req.evitar_peajes and (matrix_failed or matrix_nulls)

    # Asegura que el ranking final use desvíos en tiempo obtenidos de ruta real A->S->B.
    if skip_matrix_for_tolls:
        exact_refine_limit = min(len(enriched), 5)
    else:
        exact_refine_limit = min(
            len(enriched),
            max(req.top_n, settings.MAX_REAL_DETOUR_CHECKS),
        )
    await _refine_exact_detours(
        req,
        origin,
        dest,
        route_dist_km,
        route_duration_min,
        enriched,
        limit=exact_refine_limit,
        refine_by_price=skip_matrix_for_tolls,
    )

    enriched = filter_viable_candidates(
        enriched,
        current_progress=current_progress,
        detour_limit_min=detour_limit_min,
        detour_limit_km=detour_limit_km,
    )

    exact_candidates = [item for item in enriched if item.detour_source == "exact"]
    ranking_pool = exact_candidates if len(exact_candidates) >= req.top_n else enriched

    scored = score_candidates(ranking_pool, req.peso_precio, req.peso_desvio)
    _apply_osm_access_inference(scored)
    scored = _apply_access_policy(scored)
    scored = sorted(scored, key=lambda c: c.score, reverse=True)
    top = scored[: req.top_n]

    precio_min, precio_max, precio_medio = summarize_prices(enriched)

    items: List[RecomendacionItem] = []
    for i, candidate in enumerate(top, start=1):
        station = candidate.station

        ahorro = None
        if req.litros_deposito and precio_max > candidate.precio:
            ahorro = round((precio_max - candidate.precio) * req.litros_deposito, 2)

        dif_vs_barata = None
        if len(enriched) > 1:
            dif_vs_barata = round(candidate.precio - precio_min, 3)

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
                precio_litro=candidate.precio,
                desvio_km=candidate.desvio_km,
                desvio_min_estimado=candidate.desvio_min,
                distancia_desde_origen_km=candidate.dist_from_origin,
                porcentaje_ruta=candidate.pct,
                score=candidate.score,
                ahorro_vs_mas_cara_eur=ahorro,
                diferencia_vs_mas_barata_eur_litro=dif_vs_barata,
                tipo_acceso=station.access_category,
                fuente_tipo_acceso=station.access_source,
                confianza_tipo_acceso=station.access_confidence,
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
        opciones_parada=build_stop_option_candidates(items),
        metadata={
            "detour_strategy": "time_based",
            "detour_minutes_source": "matrix_plus_exact_duration_delta",
            "max_detour_minutes_effective": detour_limit_min,
            "max_detour_km_effective": round(detour_limit_km, 2),
            "route_avg_speed_kmh": round(route_avg_speed_kmh, 1),
            "exact_refine_candidates": exact_refine_limit,
            "detour_candidates_exact": len(exact_candidates),
            "detour_candidates_total_viable": len(enriched),
            "detour_exact_required_for_top": len(exact_candidates) >= req.top_n,
            "poi_access_provider": settings.POI_ACCESS_PROVIDER,
        },
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
                        "geometry": {
                            "type": "Point",
                            "coordinates": [item.gasolinera.lon, item.gasolinera.lat],
                        },
                        "properties": {
                            "feature_type": "gas_station",
                            "ranking": item.posicion,
                            "nombre": item.gasolinera.nombre,
                            "precio_litro": item.precio_litro,
                            "desvio_km": item.desvio_km,
                            "desvio_min_estimado": item.desvio_min_estimado,
                            "score": item.score,
                            "porcentaje_ruta": item.porcentaje_ruta,
                            "tipo_acceso": item.tipo_acceso,
                            "fuente_tipo_acceso": item.fuente_tipo_acceso,
                            "confianza_tipo_acceso": item.confianza_tipo_acceso,
                        },
                    }
                    for item in items
                ],
            ],
        },
    )
