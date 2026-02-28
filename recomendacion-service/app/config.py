"""
Configuración del servicio de recomendación.
Todas las variables son sobreescribibles via variables de entorno.
"""
from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    # ── Servidor ──────────────────────────────────────────────────────────────
    PORT: int = 8001
    LOG_LEVEL: str = "info"

    # ── Motor de routing ──────────────────────────────────────────────────────
    # "osrm"  → usa OSRM (demo público o self-hosted, sin API key)
    # "ors"   → usa OpenRouteService (requiere ORS_API_KEY)
    ROUTING_BACKEND: Literal["osrm", "ors"] = "ors"


    # ORS (OpenRouteService) – gratis hasta 2000 req/día: https://openrouteservice.org/
    # GET /v2/directions/{profile}?api_key=KEY&start=lon,lat&end=lon,lat
    ORS_BASE_URL: str = "https://api.openrouteservice.org"
    ORS_API_KEY: str = ""  # Requerido cuando ROUTING_BACKEND=ors. Definir en .env o variable de entorno.

    # ── Fuente de datos de gasolineras ─────────────────────────────────────────
    # Apunta al gateway del proyecto. Para uso standalone puedes cambiarlo a
    # cualquier API REST que devuelva el mismo formato JSON de gasolineras.
    GASOLINERAS_API_URL: str = "http://gateway:8080/api/gasolineras/?limit=2000"

    # ── Parámetros por defecto del algoritmo ──────────────────────────────────
    # Peso que tiene el precio en la puntuación compuesta [0-1]
    DEFAULT_WEIGHT_PRICE: float = 0.6
    # Peso que tiene el desvío en la puntuación compuesta [0-1]
    DEFAULT_WEIGHT_DETOUR: float = 0.4
    # Desvío máximo permitido en km para incluir una gasolinera
    DEFAULT_MAX_DESVIO_KM: float = 5.0
    # Número de recomendaciones a devolver por defecto
    DEFAULT_TOP_N: int = 5
    # Radio de pre-filtrado geométrico (km) antes del cálculo de desvío real
    PRE_FILTER_RADIUS_KM: float = 20.0

    # ── Timeouts HTTP ─────────────────────────────────────────────────────────
    ROUTING_TIMEOUT_S: float = 10.0
    GASOLINERAS_TIMEOUT_S: float = 15.0

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
