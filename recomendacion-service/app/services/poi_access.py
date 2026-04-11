"""Clasificación de acceso vial para gasolineras usando OSM/Mapbox/Google Places."""
import logging
from typing import Callable, Optional, TypedDict

import httpx

from app.config import settings
from app.models.schemas import GasolineraInternal
from app.services.geo_math import haversine_km

logger = logging.getLogger(__name__)

SERVICE_AREA_TEXT = "service area"
OSM = "osm"
MAPBOX = "mapbox"
GOOGLE = "google"


class AccessClassification(TypedDict):
    category: str
    confidence: float
    source: str


def _infer_from_osm(station: GasolineraInternal) -> AccessClassification:
    highway = (station.osm_highway or "").strip().lower()
    text = f"{station.nombre or ''} {station.direccion or ''}".lower()

    if station.es_area_servicio or highway in {"services", "rest_area"}:
        return {"category": "service_area", "confidence": 0.9, "source": OSM}
    if highway in {"motorway", "motorway_link", "trunk", "trunk_link"}:
        return {"category": "highway_exit", "confidence": 0.78, "source": OSM}
    if "area de servicio" in text or SERVICE_AREA_TEXT in text:
        return {"category": "service_area", "confidence": 0.72, "source": OSM}
    if "poligono" in text or "avenida" in text or "calle" in text:
        return {"category": "urban_local", "confidence": 0.58, "source": OSM}
    return {"category": "unknown", "confidence": 0.35, "source": OSM}


def _provider_order(selected: Optional[str]) -> list[str]:
    provider = selected or settings.POI_ACCESS_PROVIDER
    if provider == "auto":
        order: list[str] = []
        if settings.GOOGLE_PLACES_API_KEY:
            order.append(GOOGLE)
        if settings.MAPBOX_ACCESS_TOKEN:
            order.append(MAPBOX)
        order.append(OSM)
        return order

    if provider == GOOGLE:
        return [GOOGLE, MAPBOX, OSM]
    if provider == MAPBOX:
        return [MAPBOX, GOOGLE, OSM]
    return [OSM]


def _classify_text(text: str, source: str) -> AccessClassification:
    normalized = text.lower()
    if SERVICE_AREA_TEXT in normalized or "rest area" in normalized or "area de servicio" in normalized:
        return {"category": "service_area", "confidence": 0.82, "source": source}
    if "highway" in normalized or "motorway" in normalized or "autovia" in normalized or "autopista" in normalized:
        return {"category": "highway_exit", "confidence": 0.74, "source": source}
    return {"category": "urban_local", "confidence": 0.61, "source": source}


def _best_by_distance(candidates: list[dict], lat: float, lon: float, location_getter: Callable[[dict], Optional[tuple[float, float]]]) -> Optional[dict]:
    best = None
    best_dist = float("inf")
    for item in candidates:
        point = location_getter(item)
        if point is None:
            continue
        p_lat, p_lon = point
        dist = haversine_km(lat, lon, p_lat, p_lon)
        if dist < best_dist:
            best_dist = dist
            best = item
    return best


def _mapbox_coords(feature: dict) -> Optional[tuple[float, float]]:
    coords = (feature.get("geometry") or {}).get("coordinates") or []
    if len(coords) < 2:
        return None
    return float(coords[1]), float(coords[0])


def _google_coords(place: dict) -> Optional[tuple[float, float]]:
    location = place.get("location") or {}
    lat = location.get("latitude")
    lon = location.get("longitude")
    if lat is None or lon is None:
        return None
    return float(lat), float(lon)


async def _classify_with_mapbox(station: GasolineraInternal, client: httpx.AsyncClient) -> Optional[AccessClassification]:
    token = (settings.MAPBOX_ACCESS_TOKEN or "").strip()
    if not token:
        return None

    query = station.nombre or "gas station"
    url = f"{settings.MAPBOX_SEARCH_BASE_URL}/{query}.json"
    params = {
        "proximity": f"{station.lon},{station.lat}",
        "types": "poi,address",
        "limit": 3,
        "access_token": token,
    }

    response = await client.get(url, params=params, timeout=settings.ACCESS_ENRICHMENT_TIMEOUT_S)
    response.raise_for_status()
    features = (response.json() or {}).get("features") or []
    if not features:
        return None

    best = _best_by_distance(features, station.lat, station.lon, _mapbox_coords)
    if not best:
        return None

    text = " ".join(
        [
            str(best.get("text") or ""),
            str(best.get("place_name") or ""),
            str((best.get("properties") or {}).get("category") or ""),
        ]
    )
    return _classify_text(text, MAPBOX)


async def _classify_with_google(station: GasolineraInternal, client: httpx.AsyncClient) -> Optional[AccessClassification]:
    api_key = (settings.GOOGLE_PLACES_API_KEY or "").strip()
    if not api_key:
        return None

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.types,places.location",
    }
    payload = {
        "includedTypes": ["gas_station", "rest_stop"],
        "maxResultCount": 5,
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": station.lat, "longitude": station.lon},
                "radius": 200.0,
            }
        },
    }

    response = await client.post(
        settings.GOOGLE_PLACES_BASE_URL,
        headers=headers,
        json=payload,
        timeout=settings.ACCESS_ENRICHMENT_TIMEOUT_S,
    )
    response.raise_for_status()
    places = (response.json() or {}).get("places") or []
    if not places:
        return None

    best = _best_by_distance(places, station.lat, station.lon, _google_coords)
    if not best:
        return None

    types = {str(item).lower() for item in (best.get("types") or [])}
    text = " ".join(
        [
            str((best.get("displayName") or {}).get("text") or ""),
            str(best.get("formattedAddress") or ""),
            " ".join(types),
        ]
    )

    classification: AccessClassification = _classify_text(text, GOOGLE)
    if "rest_stop" in types and classification["category"] != "service_area":
        classification = {
            "category": "service_area",
            "confidence": 0.86,
            "source": GOOGLE,
        }
    return classification


async def _classify_by_provider(provider: str, station: GasolineraInternal, client: httpx.AsyncClient) -> Optional[AccessClassification]:
    if provider == MAPBOX:
        return await _classify_with_mapbox(station, client)
    if provider == GOOGLE:
        return await _classify_with_google(station, client)
    return _infer_from_osm(station)


async def classify_station_access(
    station: GasolineraInternal,
    *,
    provider: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> AccessClassification:
    """Clasifica el tipo de acceso de una estación con fallback controlado."""
    fallback = _infer_from_osm(station)
    order = _provider_order(provider)

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient()

    try:
        for selected in order:
            if selected == OSM:
                return fallback
            try:
                result = await _classify_by_provider(selected, station, client)
                if result:
                    return result
            except Exception as exc:
                logger.warning("Proveedor %s no disponible para clasificación de acceso: %s", selected, exc)
        return fallback
    finally:
        if own_client and client is not None:
            await client.aclose()
