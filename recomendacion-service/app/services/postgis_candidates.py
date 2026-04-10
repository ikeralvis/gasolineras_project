"""
Consultas de candidatas de ruta con PostGIS.

Este modulo usa ST_DWithin + ST_LineLocatePoint para:
1) buscar gasolineras cerca de toda la ruta,
2) descartar las que quedan por detras de la posicion actual snappeada.
"""
import logging
from typing import Any, List, Optional, Set

from app.config import settings
from app.models.schemas import GasolineraInternal

try:
    import asyncpg  # type: ignore[import-not-found]
except Exception:  # pragma: no cover - depende del entorno
    asyncpg = None

logger = logging.getLogger(__name__)

# Solo estos combustibles estan normalizados en la tabla postgres actual.
POSTGIS_PRICE_COLUMN_MAP = {
    "gasolina_95": "precio_95_e5",
    "gasolina_98": "precio_98_e5",
    "gasoleo_a": "precio_gasoleo_a",
    "gasoleo_premium": "precio_gasoleo_premium",
}

_pool: Any = None
_columns_cache: Optional[Set[str]] = None


def supports_postgis_fuel(combustible: str) -> bool:
    return combustible in POSTGIS_PRICE_COLUMN_MAP


def postgis_candidate_source_enabled() -> bool:
    source = settings.ROUTE_CANDIDATES_SOURCE
    if source == "api":
        return False
    if not settings.DATABASE_URL:
        return False
    if asyncpg is None:
        return False
    return True


def _normalize_dsn(dsn: str) -> str:
    normalized = (dsn or "").strip().strip('"').strip("'")
    if not normalized:
        return normalized
    if "sslmode=" not in normalized:
        sep = "&" if "?" in normalized else "?"
        normalized = f"{normalized}{sep}sslmode=require"
    return normalized


def _route_to_wkt(route_coordinates: List[List[float]]) -> str:
    if len(route_coordinates) < 2:
        raise ValueError("Se necesitan al menos 2 puntos para formar LINESTRING")

    points = []
    for coord in route_coordinates:
        if not isinstance(coord, list) or len(coord) < 2:
            continue
        lon, lat = float(coord[0]), float(coord[1])
        points.append(f"{lon:.6f} {lat:.6f}")

    if len(points) < 2:
        raise ValueError("La geometria de ruta no contiene coordenadas validas")

    return f"LINESTRING({', '.join(points)})"


async def _get_pool() -> Any:
    global _pool

    if asyncpg is None:
        raise RuntimeError("asyncpg no esta instalado en el entorno")

    if _pool is not None:
        return _pool

    dsn = _normalize_dsn(settings.DATABASE_URL)
    if not dsn:
        raise RuntimeError("DATABASE_URL no configurada para consultas PostGIS")

    _pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=1,
        max_size=4,
        timeout=settings.ROUTING_TIMEOUT_S,
        command_timeout=settings.ROUTING_TIMEOUT_S,
    )
    logger.info("Pool asyncpg creado para busqueda de candidatas en ruta")
    return _pool


async def _load_columns(pool: Any) -> Set[str]:
    global _columns_cache
    if _columns_cache is not None:
        return _columns_cache

    rows = await pool.fetch(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gasolineras'
        """
    )
    _columns_cache = {str(row["column_name"]).lower() for row in rows}
    return _columns_cache


async def fetch_route_candidates_postgis(
    route_coordinates: List[List[float]],
    combustible: str,
    current_lat: float,
    current_lon: float,
    buffer_km: float,
    limit: Optional[int] = None,
) -> List[GasolineraInternal]:
    if not supports_postgis_fuel(combustible):
        raise ValueError(f"Combustible no soportado por consulta PostGIS: {combustible}")

    price_column = POSTGIS_PRICE_COLUMN_MAP[combustible]
    route_wkt = _route_to_wkt(route_coordinates)
    max_candidates = limit or settings.POSTGIS_ROUTE_MAX_CANDIDATES

    pool = await _get_pool()
    columns = await _load_columns(pool)

    osm_highway_expr = "NULL::text AS osm_highway"
    if "osm_highway" in columns:
        osm_highway_expr = "g.osm_highway::text AS osm_highway"
    elif "highway" in columns:
        osm_highway_expr = "g.highway::text AS osm_highway"

    service_area_expr = "FALSE AS es_area_servicio"
    if "es_area_servicio" in columns:
        service_area_expr = "COALESCE(g.es_area_servicio, FALSE) AS es_area_servicio"
    elif "is_service_area" in columns:
        service_area_expr = "COALESCE(g.is_service_area, FALSE) AS es_area_servicio"

    sql = f"""
        WITH route AS (
            SELECT ST_GeomFromText($1, 4326) AS geom
        ),
        current_pos AS (
            SELECT GREATEST(
                0.0,
                LEAST(
                    1.0,
                    ST_LineLocatePoint(route.geom, ST_SetSRID(ST_MakePoint($2, $3), 4326))
                )
            ) AS progress
            FROM route
        ),
        candidates AS (
            SELECT
                g.ideess,
                g.rotulo,
                g.direccion,
                g.municipio,
                g.provincia,
                g.latitud,
                g.longitud,
                g.horario,
                g.{price_column} AS precio,
                {osm_highway_expr},
                {service_area_expr},
                ST_LineLocatePoint(route.geom, g.geom::geometry) AS route_progress,
                ST_Distance(g.geom, route.geom::geography) / 1000.0 AS offset_km
            FROM gasolineras g
            CROSS JOIN route
            WHERE g.geom IS NOT NULL
              AND g.{price_column} IS NOT NULL
              AND g.{price_column} > 0
              AND ST_DWithin(g.geom, route.geom::geography, $4)
        )
        SELECT
            ideess,
            rotulo,
            direccion,
            municipio,
            provincia,
            latitud,
            longitud,
            horario,
            precio,
            osm_highway,
            es_area_servicio
        FROM candidates c
        CROSS JOIN current_pos cp
        WHERE c.route_progress >= cp.progress
        ORDER BY c.route_progress ASC, c.offset_km ASC, c.precio ASC
        LIMIT $5
    """

    rows = await pool.fetch(sql, route_wkt, current_lon, current_lat, buffer_km * 1000.0, max_candidates)

    result: List[GasolineraInternal] = []
    for row in rows:
        lat = row["latitud"]
        lon = row["longitud"]
        precio = row["precio"]
        if lat is None or lon is None or precio is None:
            continue

        result.append(
            GasolineraInternal(
                id=str(row["ideess"] or ""),
                nombre=str(row["rotulo"] or ""),
                direccion=str(row["direccion"] or ""),
                municipio=str(row["municipio"] or ""),
                provincia=str(row["provincia"] or ""),
                lat=float(lat),
                lon=float(lon),
                precio=float(precio),
                horario=str(row["horario"] or ""),
                tipo_venta="",
                osm_highway=str(row["osm_highway"] or "").strip() or None,
                es_area_servicio=bool(row["es_area_servicio"] or False),
            )
        )

    logger.info("PostGIS candidatas en ruta: %d", len(result))
    return result
