"""
Endpoints REST del servicio de recomendación.

POST /recomendacion/ruta
    Dada una ruta A→B, devuelve las mejores gasolineras donde repostar.

GET  /recomendacion/cercanas
    Devuelve las gasolineras más cercanas a un punto con precio del combustible.

GET  /recomendacion/combustibles
    Devuelve los tipos de combustible disponibles.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from app.config import settings
from app.models.schemas import (
    RecomendacionRequest,
    RecomendacionResponse,
    GasolineraInternal,
    COMBUSTIBLE_FIELD_MAP,
    CombustibleTipo,
)
from app.services.gasolineras_client import fetch_gasolineras
from app.services.recommender import build_recommendations
from app.services.routing import get_route, haversine_km

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/recomendacion", tags=["Recomendación"])


# ─────────────────────────────────────────────────────────────────────────────
# POST /recomendacion/ruta  (endpoint principal)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/ruta",
    response_model=RecomendacionResponse,
    summary="Recomendar gasolineras en una ruta",
    description="""
Dado un punto **origen** y un **destino**, calcula la ruta A→B y devuelve las
mejores gasolineras donde repostar, ordenadas por una puntuación compuesta
que combina **precio** y **desvío**.

### Cómo funciona
1. Solicita la ruta A→B al motor de routing configurado (OSRM por defecto).
2. Construye un corredor geométrico alrededor de la ruta.
3. Pre-filtra las ~11 000 gasolineras españolas a las que caen en el corredor.
4. Calcula el desvío aproximado (A→gasolinera→B − A→B) para cada candidata.
5. Descarta las que superan `max_desvio_km`.
6. Puntúa con `score = peso_precio*(1−precio_norm) + peso_desvio*(1−desvio_norm)`.
7. Devuelve el `top_n` ordenado de mayor a menor score.

### Campos clave de la respuesta
- `recomendaciones[].score`: puntuación compuesta [0–1], **mayor es mejor**.
- `recomendaciones[].desvio_km`: km extra respecto a la ruta directa.
- `recomendaciones[].porcentaje_ruta`: en qué punto del viaje se encontraría.
- `recomendaciones[].ahorro_vs_mas_cara_eur`: ahorro en € vs la opción más cara
  (solo si proporcionas `litros_deposito`).
""",
)
async def recomendar_ruta(body: RecomendacionRequest) -> RecomendacionResponse:
    ts_start = datetime.now(timezone.utc)

    async with httpx.AsyncClient() as client:
        # 1. Calcular ruta base
        route = await get_route(
            body.origen.lat,
            body.origen.lon,
            body.destino.lat,
            body.destino.lon,
            client=client,
        )

        if route.distancia_km < 0.1:
            raise HTTPException(
                status_code=422,
                detail="La distancia entre origen y destino es demasiado pequeña.",
            )

        # 2. Obtener gasolineras
        stations = await fetch_gasolineras(body.combustible, client=client)

    if not stations:
        raise HTTPException(
            status_code=503,
            detail="No se pudieron obtener datos de gasolineras. Inténtalo más tarde.",
        )

    # 3. Recomendar
    result = build_recommendations(body, route, stations)

    # 4. Añadir metadatos
    ts_end = datetime.now(timezone.utc)
    result.metadata = {
        "routing_backend": settings.ROUTING_BACKEND,
        "gasolineras_fuente": settings.GASOLINERAS_API_URL,
        "timestamp_utc": ts_start.isoformat(),
        "procesado_en_ms": round((ts_end - ts_start).total_seconds() * 1000),
    }

    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /recomendacion/cercanas
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/cercanas",
    summary="Gasolineras más cercanas a un punto",
    description="Devuelve las N gasolineras más cercanas a unas coordenadas, con el precio del combustible indicado.",
)
async def cercanas(
    lat: float = Query(..., ge=-90, le=90, description="Latitud WGS84"),
    lon: float = Query(..., ge=-180, le=180, description="Longitud WGS84"),
    combustible: CombustibleTipo = Query("gasolina_95", description="Tipo de combustible"),
    radio_km: float = Query(10.0, gt=0, le=100, description="Radio de búsqueda en km"),
    top_n: int = Query(10, ge=1, le=50, description="Número máximo de resultados"),
):
    stations = await fetch_gasolineras(combustible)
    if not stations:
        raise HTTPException(status_code=503, detail="No se pudieron obtener gasolineras.")

    results = []
    for s in stations:
        if not s.tiene_precio:
            continue
        dist = haversine_km(lat, lon, s.lat, s.lon)
        if dist <= radio_km:
            results.append(
                {
                    "gasolinera": {
                        "id": s.id,
                        "nombre": s.nombre,
                        "direccion": s.direccion,
                        "municipio": s.municipio,
                        "provincia": s.provincia,
                        "lat": s.lat,
                        "lon": s.lon,
                        "horario": s.horario,
                    },
                    "precio_litro": s.precio,
                    "distancia_km": round(dist, 2),
                    "combustible": combustible,
                }
            )

    results.sort(key=lambda x: x["distancia_km"])
    return {
        "total": len(results),
        "radio_km": radio_km,
        "combustible": combustible,
        "gasolineras": results[:top_n],
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /recomendacion/combustibles
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/combustibles",
    summary="Tipos de combustible disponibles",
)
async def combustibles():
    return {
        "combustibles": [
            {"id": k, "campo_api": v}
            for k, v in COMBUSTIBLE_FIELD_MAP.items()
        ]
    }
