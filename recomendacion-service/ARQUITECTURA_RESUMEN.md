# Recomendacion Service - Resumen corto

## Flujo
1. Frontend llama al gateway: `POST /api/recomendacion/ruta`.
2. Gateway hace proxy al microservicio: `POST /recomendacion/ruta`.
3. Microservicio calcula ruta base (ORS/OSRM), filtra candidatas, calcula desvio en tiempo y ordena resultados.
4. Devuelve top de gasolineras con score + desvio + metadata.

## Archivos principales
- `app/main.py`: arranque FastAPI y rutas.
- `app/config.py`: todas las variables de entorno.
- `app/routes/recomendacion.py`: endpoint principal de recomendacion.
- `app/routes/routing.py`: endpoints de routing (`/routing/directions`, `/routing/matrix`).
- `app/services/routing.py`: cliente ORS/OSRM (ruta y matrix).
- `app/services/recommender.py`: orquestacion del algoritmo (pipeline completo).
- `app/services/recommendation_core.py`: logica pura de filtrado y scoring.
- `app/services/geo_math.py`: funciones matematicas/geometricas (haversine, buffers, normalizacion).
- `app/services/gasolineras_client.py`: descarga datos de gasolineras (gateway o fuente fallback).
- `app/services/postgis_candidates.py`: busqueda optimizada por PostGIS (opcional).
- `app/services/poi_access.py`: clasificacion de acceso vial (osm/mapbox/google).
- `app/models/schemas.py`: contrato request/response y modelos internos.

## Como decide "carretera vs pueblo"
- Base actual: heuristica OSM (sin Google Maps obligatorio).
- Politica de filtrado: `ACCESS_FILTER_MODE`.
  - `off`: no filtra por tipo de acceso.
  - `prefer`: prioriza carretera, pero puede incluir otras.
  - `strict`: intenta devolver solo `service_area` o `highway_exit`.

## Google/Mapbox: obligatorio o no
- NO obligatorio para que funcione.
- Ya esta implementado como opcion en `poi_access.py`.
- Solo se activa si configuras `POI_ACCESS_PROVIDER=google` o `mapbox` y su API key.

## Variables realmente obligatorias en Cloud Run
- `ROUTING_BACKEND`
- `ORS_API_KEY` (si usas ORS)
- `GASOLINERAS_API_URL`
- `ROUTE_CANDIDATES_SOURCE`
- `ACCESS_FILTER_MODE`
- `POI_ACCESS_PROVIDER`
