"""
Núcleo del sistema de recomendación de gasolineras.

Algoritmo en dos fases:
  Fase 1 – Pre-filtrado geométrico (Shapely):
    Construye un corredor alrededor de la ruta A→B y descarta todas las
    gasolineras fuera de ese corredor. Rápido, sin llamadas externas.

  Fase 2 – Puntuación y ranking (haversine + pesos):
    Para cada candidato calcula el desvío aproximado (A→S→B - A→B) y lo
    combina con el precio en una puntuación compuesta normalizada [0, 1].

Por qué haversine en Fase 2 y no una llamada OSRM por candidato:
  - Evita saturar el servicio de routing con decenas de llamadas.
  - El error es < 10-15 % respecto al desvío real por carretera, suficiente
    para clasificar candidatos.
  - Si se necesita precisión absoluta en el desvío, se puede activar la opción
    `use_real_routing` en futuros endpoints (cada candidato llamaría a OSRM).
"""
import logging
from typing import List, Tuple, Optional

from shapely.geometry import LineString, Point

from app.models.schemas import (
    GasolineraInternal,
    GasolineraResumen,
    RecomendacionItem,
    RecomendacionRequest,
    RecomendacionResponse,
    RouteResult,
    RutaBase,
    EstadisticasRuta,
    Coordenada,
    GasolinerasDestacadas,
)
from app.services.routing import haversine_km

logger = logging.getLogger(__name__)

# Velocidad media estimada para convertir km extra en minutos extra
AVG_SPEED_KMH = 80.0
# Factor de corrección: la distancia real por carretera suele ser ~1.3x la haversine
ROAD_FACTOR = 1.3


# ─────────────────────────────────────────────────────────────────────────────
# Fase 1: Pre-filtrado geométrico
# ─────────────────────────────────────────────────────────────────────────────

def _build_route_corridor(
    coordinates: List[List[float]], buffer_km: float
) -> "shapely.geometry.Polygon":
    """
    Crea un polígono-corredor alrededor de la ruta.

    coordinates: lista de [lon, lat] (formato GeoJSON/OSRM).
    buffer_km: semi-ancho del corredor en km.
    """
    if len(coordinates) < 2:
        # Ruta degenerada: usar un punto
        lon, lat = coordinates[0]
        center = Point(lon, lat)
        return center.buffer(buffer_km / 111.0)

    line = LineString(coordinates)  # (lon, lat) → Shapely usa (x, y)
    # 1 grado ≈ 111 km (aproximación válida para España)
    buffer_deg = buffer_km / 111.0
    return line.buffer(buffer_deg)


def _pre_filter(
    stations: List[GasolineraInternal],
    corridor,
) -> List[GasolineraInternal]:
    """Filtra las gasolineras que caen dentro del corredor."""
    candidates = []
    for s in stations:
        if corridor.contains(Point(s.lon, s.lat)):
            candidates.append(s)
    logger.debug(
        "Pre-filtrado: %d/%d gasolineras dentro del corredor", len(candidates), len(stations)
    )
    return candidates


# ─────────────────────────────────────────────────────────────────────────────
# Fase 2: Cálculo de desvío y puntuación
# ─────────────────────────────────────────────────────────────────────────────

def _calc_detour(
    origin_lat: float,
    origin_lon: float,
    station_lat: float,
    station_lon: float,
    dest_lat: float,
    dest_lon: float,
    route_dist_km: float,
) -> float:
    """
    Estima el desvío en km para parar en una gasolinera usando haversine.

    desvío = dist(A→S) + dist(S→B) − dist(A→B)

    Se aplica el factor de carretera para aproximar km reales vs línea recta.
    El resultado puede ser ligeramente negativo por errores de redondeo; se
    clipa a 0.
    """
    dist_a_s = haversine_km(origin_lat, origin_lon, station_lat, station_lon)
    dist_s_b = haversine_km(station_lat, station_lon, dest_lat, dest_lon)
    
    # El desvío ideal (línea recta) sería la distancia pasando por S menos la recta original (A->B)
    dist_a_b_recta = haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)
    desvio_recto = max(0.0, (dist_a_s + dist_s_b) - dist_a_b_recta)
    
    # Aplicamos el ROAD_FACTOR solo al tramo adicional del desvío
    approx_detour = desvio_recto * ROAD_FACTOR
    
    return approx_detour


def _position_along_route(
    station_lon: float,
    station_lat: float,
    route_line: LineString,
    route_dist_km: float,
) -> Tuple[float, float]:
    """
    Devuelve (pct, dist_from_origin_km) de la gasolinera proyectada sobre la ruta.

    pct: 0..100 (posición relativa al inicio de la ruta)
    dist_from_origin_km: km desde el origen hasta el punto más cercano de la ruta
    """
    pt = Point(station_lon, station_lat)
    # normalized=True → fracción en [0, 1]
    fraction = route_line.project(pt, normalized=True)
    pct = fraction * 100.0
    dist_km = fraction * route_dist_km
    return round(pct, 1), round(dist_km, 2)


def _normalize(values: List[float]) -> List[float]:
    """Min-max normaliza a [0, 1]. Si todos son iguales, devuelve 0.5 para todos."""
    min_v, max_v = min(values), max(values)
    if max_v == min_v:
        return [0.5] * len(values)
    return [(v - min_v) / (max_v - min_v) for v in values]


def _score_candidates(
    candidates: List[dict],
    peso_precio: float,
    peso_desvio: float,
) -> List[dict]:
    """
    Calcula la puntuación compuesta para cada candidato y ordena de mayor a menor.

    score = w_precio * (1 − precio_norm) + w_desvio * (1 − desvio_norm)
    (1 − norm porque queremos maximizar en lugar de minimizar)
    """
    if not candidates:
        return []

    prices = [c["precio"] for c in candidates]
    detours = [c["desvio_km"] for c in candidates]

    price_norms = _normalize(prices)
    detour_norms = _normalize(detours)

    for c, pn, dn in zip(candidates, price_norms, detour_norms):
        c["score"] = round(
            peso_precio * (1 - pn) + peso_desvio * (1 - dn), 4
        )

    return sorted(candidates, key=lambda x: x["score"], reverse=True)


# ─────────────────────────────────────────────────────────────────────────────
# Función principal
# ─────────────────────────────────────────────────────────────────────────────

def build_recommendations(
    req: RecomendacionRequest,
    route: RouteResult,
    stations: List[GasolineraInternal],
) -> RecomendacionResponse:
    """
    Orquesta el algoritmo completo y construye la respuesta final.

    Pasos:
      1. Construir corredor de pre-filtrado.
      2. Filtrar gasolineras dentro del corredor.
      3. Calcular desvío haversine para cada candidato.
      4. Filtrar por max_desvio_km.
      5. Descartar gasolineras sin precio para el combustible solicitado.
      6. Normalizar precio y desvío, calcular score compuesto.
      7. Ordenar y seleccionar top_n.
      8. Calcular ahorro estimado si se proporcionó litros_deposito.
    """
    route_dist_km = route.distancia_km
    origin = req.origen
    dest = req.destino

    # ── Fase 1: pre-filtrado ──────────────────────────────────────────────────
    # Usamos un corredor más amplio que max_desvio para no perder candidatos
    # cuyo desvío real (por carretera) es válido pero cuya distancia euclidiana
    # desde la ruta es mayor.
    pre_filter_km = min(
        req.max_desvio_km * 3,   # margen generoso
        50.0,                    # cap para no traer tutto el país
    )
    corridor = _build_route_corridor(route.coordinates, pre_filter_km)
    pre_candidates = _pre_filter(stations, corridor)

    if not pre_candidates:
        logger.warning("No hay gasolineras en el corredor de %.1f km", pre_filter_km)

    # ── Fase 2: filtrado por desvío y precio ──────────────────────────────────
    route_line = LineString(route.coordinates)
    enriched: List[dict] = []

    for s in pre_candidates:
        if not s.tiene_precio:
            continue

        detour = _calc_detour(
            origin.lat, origin.lon,
            s.lat, s.lon,
            dest.lat, dest.lon,
            route_dist_km,
        )

        if detour > req.max_desvio_km:
            continue




        pct, dist_from_origin = _position_along_route(
            s.lon, s.lat, route_line, route_dist_km
        )

        desvio_min = round((detour / AVG_SPEED_KMH) * 60, 1)

        enriched.append(
            {
                "station": s,
                "precio": s.precio,
                "desvio_km": round(detour, 2),
                "desvio_min": desvio_min,
                "pct": pct,
                "dist_from_origin": dist_from_origin,
            }
        )

    logger.info(
        "Candidatos tras filtro de desvío (%.1f km): %d",
        req.max_desvio_km,
        len(enriched),
    )

    # ── Puntuación ────────────────────────────────────────────────────────────
    scored = _score_candidates(enriched, req.peso_precio, req.peso_desvio)
    top = scored[: req.top_n]

    # ── Estadísticas ──────────────────────────────────────────────────────────
    all_prices = [c["precio"] for c in enriched] if enriched else [0.0]
    precio_min = min(all_prices)
    precio_max = max(all_prices)
    precio_medio = round(sum(all_prices) / len(all_prices), 3) if all_prices else 0.0

    # ── Construir items de respuesta ──────────────────────────────────────────
    items: List[RecomendacionItem] = []
    for i, c in enumerate(top, start=1):
        s: GasolineraInternal = c["station"]

        ahorro: Optional[float] = None
        if req.litros_deposito and precio_max > c["precio"]:
            ahorro = round((precio_max - c["precio"]) * req.litros_deposito, 2)

        dif_vs_barata: Optional[float] = None
        if len(all_prices) > 1:
            dif_vs_barata = round(c["precio"] - precio_min, 3)

        items.append(
            RecomendacionItem(
                posicion=i,
                gasolinera=GasolineraResumen(
                    id=s.id,
                    nombre=s.nombre,
                    direccion=s.direccion,
                    municipio=s.municipio,
                    provincia=s.provincia,
                    lat=s.lat,
                    lon=s.lon,
                    horario=s.horario,
                ),
                precio_litro=c["precio"],
                desvio_km=c["desvio_km"],
                desvio_min_estimado=c["desvio_min"],
                distancia_desde_origen_km=c["dist_from_origin"],
                porcentaje_ruta=c["pct"],
                score=c["score"],
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
            origen=Coordenada(
                lat=origin.lat,
                lon=origin.lon,
                nombre=origin.nombre,
            ),
            destino=Coordenada(
                lat=dest.lat,
                lon=dest.lon,
                nombre=dest.nombre,
            ),
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
        metadata={},
    )
