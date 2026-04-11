"""Funciones matemáticas y geométricas puras para la capa GIS."""
from math import atan2, cos, radians, sin, sqrt
from typing import Iterable, Tuple

from shapely.geometry import LineString, Point

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia geodésica en km entre dos puntos WGS84."""
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return EARTH_RADIUS_KM * 2 * atan2(sqrt(a), sqrt(1 - a))


def build_route_corridor(coordinates: list[list[float]], buffer_km: float):
    """Devuelve un buffer geométrico de la ruta para prefiltrado rápido."""
    if len(coordinates) < 2:
        lon, lat = coordinates[0]
        return Point(lon, lat).buffer(buffer_km / 111.0)

    line = LineString(coordinates)
    return line.buffer(buffer_km / 111.0)


def approx_road_detour_km(
    origin_lat: float,
    origin_lon: float,
    station_lat: float,
    station_lon: float,
    dest_lat: float,
    dest_lon: float,
    *,
    road_factor: float,
) -> float:
    """Aproximación de desvío en carretera en km usando haversine + factor vial."""
    dist_a_s = haversine_km(origin_lat, origin_lon, station_lat, station_lon)
    dist_s_b = haversine_km(station_lat, station_lon, dest_lat, dest_lon)
    dist_a_b = haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)
    detour_straight = max(0.0, (dist_a_s + dist_s_b) - dist_a_b)
    return detour_straight * road_factor


def position_along_route(
    *,
    route_line: LineString,
    station_lon: float,
    station_lat: float,
    route_dist_km: float,
) -> Tuple[float, float, float]:
    """Calcula progreso fraccional, porcentaje y distancia desde origen sobre la ruta."""
    fraction = route_line.project(Point(station_lon, station_lat), normalized=True)
    pct = round(fraction * 100.0, 1)
    km_from_origin = round(fraction * route_dist_km, 2)
    return fraction, pct, km_from_origin


def normalize_values(values: Iterable[float]) -> list[float]:
    values = list(values)
    if not values:
        return []

    min_v, max_v = min(values), max(values)
    if max_v == min_v:
        return [0.5] * len(values)

    return [(v - min_v) / (max_v - min_v) for v in values]


def km_to_minutes(km: float, avg_speed_kmh: float) -> float:
    if avg_speed_kmh <= 0:
        return 0.0
    return (km / avg_speed_kmh) * 60.0


def minutes_to_km(minutes: float, avg_speed_kmh: float) -> float:
    return (minutes / 60.0) * avg_speed_kmh
