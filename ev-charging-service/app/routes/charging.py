"""
EV Charging routes:
  POST /api/charging/markers   – proxy + upsert locations
  GET  /api/charging/details/{id} – proxy with 5-min cache
"""
import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Path

from app.db.connection import get_db_conn
from app.models.charging import BoundingBoxRequest

logger = logging.getLogger(__name__)

EXTERNAL_API_BASE = "https://www.mapareve.es/api/public/v1"

# Realistic browser User-Agent to avoid bot-blocking
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Origin": "https://www.mapareve.es",
    "Referer": "https://www.mapareve.es/",
}

# 5-minute in-memory details cache: { location_id: (cached_at, data) }
_details_cache: dict[str, tuple[datetime, dict]] = {}
_CACHE_TTL = timedelta(minutes=5)

router = APIRouter(prefix="/charging", tags=["EV Charging"])


# ── Helper: exponential backoff ───────────────────────────────────────────────

async def _fetch_with_backoff(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    **kwargs,
) -> httpx.Response:
    max_retries = 3
    for attempt in range(max_retries):
        try:
            return await client.request(method, url, **kwargs)
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            if attempt == max_retries - 1:
                raise
            wait = 2 ** attempt
            logger.warning(
                "Request failed (attempt %d/%d), retrying in %ds: %s",
                attempt + 1, max_retries, wait, exc,
            )
            await asyncio.sleep(wait)
    raise httpx.ConnectError("Max retries exceeded")  # unreachable, satisfies type checker


# ── POST /charging/markers ────────────────────────────────────────────────────

@router.post("/markers", summary="Get EV charging markers for a map viewport")
async def get_markers(bbox: BoundingBoxRequest):
    """
    Proxies the bounding-box request to mapareve.es and returns the raw
    marker list (mix of type=cluster / type=location items).

    Location-type items are upserted asynchronously into the charging_points
    table so historical data is kept even when the external API is slow.

    Raises HTTP 400 when the external API returns status_code 2001
    (bounding box is too large — the frontend must zoom in first).
    """
    # Field names must match mapareve.es public API exactly
    payload = {
        "latitude_ne": bbox.lat_ne,
        "longitude_ne": bbox.lon_ne,
        "latitude_sw": bbox.lat_sw,
        "longitude_sw": bbox.lon_sw,
        "zoom": bbox.zoom,
        "cpo_ids": [],
        "only_ocpi": False,
        "available": False,
        "connector_types": [],
        "payment_methods": [],
        "facilities": [],
        "latitude": None,
        "longitude": None,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await _fetch_with_backoff(
                client, "POST",
                f"{EXTERNAL_API_BASE}/markers",
                json=payload,
                headers=_HEADERS,
            )
        except Exception as exc:
            logger.error("External EV API unreachable: %s", exc)
            raise HTTPException(status_code=502, detail="External EV API unavailable") from exc

    # Parse JSON safely
    try:
        data = response.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Invalid response from external EV API")

    # status_code: 2001 → bounding box too large
    if isinstance(data, dict) and data.get("status_code") == 2001:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "BBOX_TOO_LARGE",
                "message": "Zoom in to see charging stations",
                "required_zoom": bbox.zoom + 2,
            },
        )

    markers: list = data if isinstance(data, list) else data.get("data", [])

    # Upsert location markers into DB (best-effort, non-blocking)
    locations = [
        m["location"]
        for m in markers
        if isinstance(m, dict) and m.get("type") == "location" and "location" in m
    ]
    if locations:
        _upsert_locations(locations)

    return markers


def _upsert_locations(locations: list[dict]) -> None:
    """Best-effort DB upsert — errors are logged but never bubble up."""
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                for loc in locations:
                    cur.execute(
                        """
                        INSERT INTO charging_points (id, name, latitude, longitude, last_sync)
                        VALUES (%s::uuid, %s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (id) DO UPDATE SET
                            name       = EXCLUDED.name,
                            latitude   = EXCLUDED.latitude,
                            longitude  = EXCLUDED.longitude,
                            last_sync  = CURRENT_TIMESTAMP
                        """,
                        (
                            str(loc.get("id", "")),
                            loc.get("name", ""),
                            loc.get("latitude", 0.0),
                            loc.get("longitude", 0.0),
                        ),
                    )
    except Exception as exc:
        logger.warning("DB upsert failed (non-critical): %s", exc)


def _upsert_location_detail(location_id: str, detail: dict) -> None:
    """Best-effort upsert of full detail data fetched from /locations/{id}."""
    try:
        operator = detail.get("operator") or {}
        opening_times = detail.get("opening_times") or {}
        # Coordinates may be top-level or nested under 'coordinates'
        coords = detail.get("coordinates") or {}
        lat = detail.get("latitude") or coords.get("latitude", 0.0)
        lon = detail.get("longitude") or coords.get("longitude", 0.0)
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO charging_points (
                        id, name, latitude, longitude,
                        address, postal_code, country,
                        operator_name, operator_website, operator_phone,
                        is_24_7, raw_detail, last_sync
                    ) VALUES (
                        %s::uuid, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s::jsonb, CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        name             = EXCLUDED.name,
                        address          = COALESCE(EXCLUDED.address, charging_points.address),
                        postal_code      = COALESCE(EXCLUDED.postal_code, charging_points.postal_code),
                        country          = COALESCE(EXCLUDED.country, charging_points.country),
                        operator_name    = COALESCE(EXCLUDED.operator_name, charging_points.operator_name),
                        operator_website = COALESCE(EXCLUDED.operator_website, charging_points.operator_website),
                        operator_phone   = COALESCE(EXCLUDED.operator_phone, charging_points.operator_phone),
                        is_24_7          = EXCLUDED.is_24_7,
                        raw_detail       = EXCLUDED.raw_detail,
                        last_sync        = CURRENT_TIMESTAMP
                    """,
                    (
                        location_id,
                        detail.get("name", ""),
                        lat,
                        lon,
                        detail.get("address"),
                        detail.get("postal_code"),
                        detail.get("country", "ESP"),
                        operator.get("name"),
                        operator.get("website"),
                        operator.get("phone"),
                        opening_times.get("twentyfourseven", True),
                        json.dumps(detail),
                    ),
                )
    except Exception as exc:
        logger.warning("DB detail upsert failed (non-critical): %s", exc)


# ── GET /charging/details/{id} ────────────────────────────────────────────────

@router.get("/details/{location_id}", summary="Get EV charging location details")
async def get_details(
    location_id: str = Path(..., description="Location UUID from mapareve.es"),
):
    """
    Returns full details for a single charging location.
    Responses are cached in memory for 5 minutes because EVSE availability
    can change quickly and we want reasonably fresh data without overloading
    the external API.
    """
    # Cache lookup
    cached = _details_cache.get(location_id)
    if cached:
        cached_at, cached_data = cached
        if datetime.now(timezone.utc) - cached_at < _CACHE_TTL:
            logger.debug("Cache hit for location %s", location_id)
            return cached_data

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await _fetch_with_backoff(
                client, "GET",
                f"{EXTERNAL_API_BASE}/locations/{location_id}",
                headers=_HEADERS,
            )
        except Exception as exc:
            logger.error("External EV API unreachable: %s", exc)
            raise HTTPException(status_code=502, detail="External EV API unavailable") from exc

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Charging location not found")

    if not response.is_success:
        raise HTTPException(status_code=502, detail="External EV API returned an error")

    try:
        detail_data = response.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Invalid response from external EV API")

    # Store in cache and persist to DB (best-effort)
    _details_cache[location_id] = (datetime.now(timezone.utc), detail_data)
    _upsert_location_detail(location_id, detail_data)

    return detail_data
