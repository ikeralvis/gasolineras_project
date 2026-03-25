"""
Microservicio de Gasolineras
API REST para sincronizar y consultar datos de estaciones de servicio
desde la fuente oficial del Gobierno de España.
"""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.gasolineras import (
    router as gasolineras_router,
    _get_snapshot_state,
    _perform_sync,
    _sync_lock,
)
from app.db.connection import close_db_connection, test_db_connection

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
AUTO_ENSURE_FRESH_ON_STARTUP = os.getenv("AUTO_ENSURE_FRESH_ON_STARTUP", "true").lower() == "true"

# Lifespan events para gestionar la conexión a la BD
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestiona el ciclo de vida de la aplicación"""
    # Startup
    logger.info("🚀 Iniciando microservicio de gasolineras (PostgreSQL/Neon)...")
    try:
        test_db_connection()
        logger.info("✅ Conexión a PostgreSQL (Neon) establecida")

        if AUTO_ENSURE_FRESH_ON_STARTUP:
            with _sync_lock:
                snapshot = _get_snapshot_state()
                if snapshot["total"] > 0 and snapshot["is_current"]:
                    logger.info(
                        "ℹ️ Snapshot vigente al arrancar (total=%s, fecha=%s)",
                        snapshot["total"],
                        snapshot["snapshot_date_local"],
                    )
                else:
                    logger.warning(
                        "⚠️ Snapshot no vigente al arrancar (total=%s, snapshot=%s, hoy=%s). Sincronizando...",
                        snapshot["total"],
                        snapshot["snapshot_date_local"],
                        snapshot["today_local"],
                    )
                    result = _perform_sync(trigger="startup")
                    logger.info(
                        "✅ Startup sync completado: total=%s, fecha_snapshot=%s",
                        result.get("total"),
                        result.get("fecha_snapshot"),
                    )
        else:
            logger.info("ℹ️ AUTO_ENSURE_FRESH_ON_STARTUP=false: no se evalúa frescura en startup")
    except Exception as e:
        logger.error(f"❌ Error al conectar con PostgreSQL: {e}")
    
    yield
    
    # Shutdown
    logger.info("🛑 Cerrando microservicio de gasolineras...")
    close_db_connection()
    logger.info("✅ Conexión a PostgreSQL cerrada")

# Crear aplicación FastAPI
app = FastAPI(
    title="Microservicio de Gasolineras",
    description="""
    API REST para sincronizar y consultar información de estaciones de servicio en España.
    
    ## Características
    * 📊 Consulta de gasolineras con filtros
    * 🔄 Sincronización automática desde API del gobierno
    * 📍 Búsqueda por ubicación geográfica
    * 💰 Filtrado por precios de combustible
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://localhost:80").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir routers
app.include_router(gasolineras_router)

@app.get("/", tags=["General"])
def root():
    """
    Endpoint raíz que devuelve información básica del servicio
    """
    return {
        "service": "microservicio-gasolineras",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "redoc": "/redoc"
    }

@app.get("/health", tags=["General"])
def health_check():
    """
    Health check para monitoreo del servicio
    """
    try:
        test_db_connection()
        return {
            "status": "healthy",
            "database": "connected"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }
