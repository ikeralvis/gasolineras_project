"""Integracion EV Charging en el mismo gasolineras-service.

Expone endpoints EV y consulta mapareve directamente. La persistencia en
PostgreSQL es opcional y best-effort.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field

from app.db.connection import get_db_conn, is_db_configured

logger = logging.getLogger(__name__)

EXTERNAL_API_BASE = "https://www.mapareve.es/api/public/v1"

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

_details_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}
_CACHE_TTL = timedelta(minutes=5)

router = APIRouter(tags=["EV Charging"])


class EvBoundingBoxRequest(BaseModel):
    lat_ne: float = Field(..., description="Latitud noreste")
    lon_ne: float = Field(..., description="Longitud noreste")
    lat_sw: float = Field(..., description="Latitud suroeste")
    lon_sw: float = Field(..., description="Longitud suroeste")
    zoom: int = Field(..., ge=1, le=22, description="Zoom actual del mapa")


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
                "EV request failed (attempt %d/%d), retry in %ds: %s",
                attempt + 1,
                max_retries,
                wait,
                exc,
            )
            await asyncio.sleep(wait)
    raise httpx.ConnectError("Max retries exceeded")


def _upsert_locations(locations: list[dict]) -> None:
    """Persistencia best-effort. Si no hay DB, se ignora."""
    if not is_db_configured():
        return

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
        logger.warning("EV DB upsert failed (non-critical): %s", exc)


def _upsert_location_detail(location_id: str, detail: dict) -> None:
    """Persistencia best-effort de detalle EV."""
    if not is_db_configured():
        return

    try:
        operator = detail.get("operator") or {}
        opening_times = detail.get("opening_times") or {}
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
        logger.warning("EV DB detail upsert failed (non-critical): %s", exc)


@router.get("/api/charging/health", summary="Health EV integrado")
@router.get("/gasolineras/ev/health", include_in_schema=False)
async def ev_health():
    return {
        "status": "healthy",
        "source": "mapareve",
        "cache_mode": "postgres-cache" if is_db_configured() else "memory-only",
    }


@router.post(
    "/api/charging/markers",
    summary="Markers EV por viewport",
    responses={400: {"description": "BBOX demasiado grande"}, 502: {"description": "API EV externa no disponible"}},
)
@router.post("/gasolineras/ev/markers", include_in_schema=False)
async def ev_markers(bbox: EvBoundingBoxRequest):
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
                client,
                "POST",
                f"{EXTERNAL_API_BASE}/markers",
                json=payload,
                headers=_HEADERS,
            )
        except Exception as exc:
            logger.error("External EV API unreachable: %s", exc)
            raise HTTPException(status_code=502, detail="External EV API unavailable") from exc

    try:
        data = response.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Invalid response from external EV API") from exc

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

    locations = [
        m.get("location")
        for m in markers
        if isinstance(m, dict) and m.get("type") == "location" and isinstance(m.get("location"), dict)
    ]
    if locations:
        _upsert_locations(locations)

    return markers


@router.get(
    "/api/charging/details/{location_id}",
    summary="Detalle EV por location_id",
    responses={404: {"description": "No encontrado"}, 502: {"description": "API EV externa no disponible"}},
)
@router.get("/gasolineras/ev/details/{location_id}", include_in_schema=False)
async def ev_details(
    location_id: Annotated[str, Path(description="UUID de la localizacion EV")],
):
    cached = _details_cache.get(location_id)
    if cached:
        cached_at, cached_data = cached
        if datetime.now(timezone.utc) - cached_at < _CACHE_TTL:
            return cached_data

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await _fetch_with_backoff(
                client,
                "GET",
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
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Invalid response from external EV API") from exc

    _details_cache[location_id] = (datetime.now(timezone.utc), detail_data)
    _upsert_location_detail(location_id, detail_data)
    return detail_data
