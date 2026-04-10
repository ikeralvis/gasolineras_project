"""
Punto de entrada de la aplicación FastAPI – Servicio de Recomendación.
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.recomendacion import router as recomendacion_router
from app.routes.routing import router as routing_router

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=settings.LOG_LEVEL.upper(),
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# FastAPI
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Recomendación de Gasolineras",
    description=(
        "Servicio independiente que, dada una ruta A→B, "
        "recomienda las mejores gasolineras donde repostar "
        "equilibrando precio y desvío de la ruta.\n\n"
        "Puede consumir datos de gasolineras desde cualquier API REST "
        "compatible o directamente desde la API del Ministerio español."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ─────────────────────────────────────────────────────────────────────────────
# CORS – permite consumo desde cualquier frontend o asistente conversacional
# ─────────────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# Rutas
# ─────────────────────────────────────────────────────────────────────────────
app.include_router(recomendacion_router)
app.include_router(routing_router)


@app.get("/health", tags=["Sistema"])
async def health():
    return {
        "status": "ok",
        "routing_backend": settings.ROUTING_BACKEND,
        "gasolineras_api": settings.GASOLINERAS_API_URL,
    }


@app.get("/", tags=["Sistema"])
async def root():
    return {
        "servicio": "recomendacion-gasolineras",
        "version": "1.0.0",
        "docs": "/docs",
    }
