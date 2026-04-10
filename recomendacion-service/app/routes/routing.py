"""Endpoints de routing expuestos por recomendacion-service."""
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.routing import get_matrix_durations, get_route_by_coordinates

router = APIRouter(prefix="/routing", tags=["Routing"])


class RoutingDirectionsRequest(BaseModel):
    coordinates: list[list[float]] = Field(
        ...,
        description="Lista de coordenadas [lon, lat] para trazar la ruta.",
    )
    avoid_tolls: bool = Field(False, description="Evitar peajes cuando el backend lo soporte.")
    backend: Optional[Literal["ors", "osrm"]] = Field(
        None,
        description="Backend de routing. Si se omite, usa el configurado por defecto.",
    )
    profile: Optional[str] = Field(
        default="driving-car",
        description="Campo mantenido por compatibilidad; actualmente no altera el perfil.",
    )


class RoutingDirectionsResponse(BaseModel):
    provider: Literal["ors", "osrm"]
    distance_m: float
    duration_s: float
    coordinates: list[list[float]]


class RoutingMatrixRequest(BaseModel):
    coordinates: list[list[float]] = Field(..., description="Lista de coordenadas [lon, lat].")
    sources: list[int] = Field(..., description="Indices de origen en coordinates.")
    destinations: list[int] = Field(..., description="Indices de destino en coordinates.")
    avoid_tolls: bool = Field(False, description="Evitar peajes cuando el backend lo soporte.")
    backend: Optional[Literal["ors", "osrm"]] = Field(
        None,
        description="Backend de routing. Matrix solo se soporta en ORS.",
    )
    profile: Optional[str] = Field(
        default="driving-car",
        description="Campo mantenido por compatibilidad; actualmente no altera el perfil.",
    )


class RoutingMatrixResponse(BaseModel):
    provider: Literal["ors"]
    durations_s: list[list[Optional[float]]]


def _as_lonlat_tuples(raw_coordinates: list[list[float]]) -> list[tuple[float, float]]:
    coords: list[tuple[float, float]] = []
    for point in raw_coordinates:
        if not isinstance(point, list) or len(point) != 2:
            raise HTTPException(status_code=400, detail="Cada coordenada debe tener el formato [lon, lat]")
        lon, lat = point
        coords.append((float(lon), float(lat)))
    return coords


def _to_status_code(exc: Exception) -> int:
    message = str(exc).lower()
    if "backend de routing desconocido" in message or "matrix actualmente soportada" in message:
        return 422
    if "al menos dos coordenadas" in message:
        return 400
    if "api_key" in message:
        return 503
    return 503


@router.post(
    "/directions",
    summary="Calcular ruta entre coordenadas",
    responses={
        400: {"description": "Solicitud invalida"},
        422: {"description": "Backend no soportado o parametros fuera de contrato"},
        503: {"description": "Proveedor de routing no disponible"},
    },
)
async def routing_directions(body: RoutingDirectionsRequest) -> RoutingDirectionsResponse:
    if len(body.coordinates) < 2:
        raise HTTPException(status_code=400, detail="coordinates must have at least 2 points")

    coordinates = _as_lonlat_tuples(body.coordinates)

    try:
        provider, route = await get_route_by_coordinates(
            coordinates=coordinates,
            backend=body.backend,
            evitar_peajes=body.avoid_tolls,
        )
        return RoutingDirectionsResponse(
            provider=provider,
            distance_m=route.distancia_m,
            duration_s=route.duracion_s,
            coordinates=route.coordinates,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=_to_status_code(exc), detail=str(exc)) from exc


@router.post(
    "/matrix",
    summary="Calcular matriz de tiempos",
    responses={
        400: {"description": "Solicitud invalida"},
        422: {"description": "Backend no soportado para matrix"},
        503: {"description": "Proveedor de routing no disponible"},
    },
)
async def routing_matrix(body: RoutingMatrixRequest) -> RoutingMatrixResponse:
    if not body.coordinates or not body.sources or not body.destinations:
        raise HTTPException(status_code=400, detail="coordinates, sources and destinations are required")

    coordinates = _as_lonlat_tuples(body.coordinates)

    try:
        provider, durations = await get_matrix_durations(
            coordinates=coordinates,
            sources=body.sources,
            destinations=body.destinations,
            backend=body.backend,
            evitar_peajes=body.avoid_tolls,
        )
        return RoutingMatrixResponse(provider=provider, durations_s=durations)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=_to_status_code(exc), detail=str(exc)) from exc
