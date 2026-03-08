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
from app.routes.gasolineras import router as gasolineras_router
from app.db.connection import close_db_connection, test_db_connection

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Lifespan events para gestionar la conexión a la BD
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestiona el ciclo de vida de la aplicación"""
    # Startup
    logger.info("🚀 Iniciando microservicio de gasolineras (PostgreSQL/Neon)...")
    try:
        test_db_connection()
        logger.info("✅ Conexión a PostgreSQL (Neon) establecida")
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
