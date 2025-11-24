"""
Gestión de conexión a MongoDB
"""
import os
import logging
from typing import Any
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

logger = logging.getLogger(__name__)

# Variables de entorno
MONGO_HOST = os.getenv("MONGO_HOST", "mongo")
MONGO_PORT = int(os.getenv("MONGO_PORT", "27017"))
MONGO_USER = os.getenv("MONGO_USER", "")
MONGO_PASS = os.getenv("MONGO_PASS", "")
MONGO_DB = os.getenv("MONGO_DB", "gasolineras_db")
ENVIRONMENT = os.getenv("ENVIRONMENT", "local")  # local o production

# Construir URI de conexión
MONGO_URI_ENV = os.getenv("MONGO_URI")

if MONGO_URI_ENV:
    # 🔥 Usamos Atlas en Render/Producción
    MONGO_URI = MONGO_URI_ENV
else:
    # 🐳 Modo local con Docker (igual que antes)
    if MONGO_USER and MONGO_PASS:
        MONGO_URI = f"mongodb://{MONGO_USER}:{MONGO_PASS}@{MONGO_HOST}:{MONGO_PORT}"
    else:
        MONGO_URI = f"mongodb://{MONGO_HOST}:{MONGO_PORT}"

# Configuración de TLS
USE_TLS = os.getenv("USE_TLS", "false").lower() == "true" or "mongodb+srv://" in MONGO_URI or ENVIRONMENT == "production"
ALLOW_INVALID_CERTS = os.getenv("TLS_ALLOW_INVALID_CERTS", "false").lower() == "true"

# Cliente global
_client = None
_db = None
_collection = None
_collection_historico = None

def get_mongo_client():
    """Obtiene o crea el cliente de MongoDB"""
    global _client
    if _client is None:
        try:
            # Configuración base de conexión
            connection_params: dict[str, Any] = {
                "serverSelectionTimeoutMS": 5000,
                "maxPoolSize": 10,
                "minPoolSize": 1
            }
            
            # Solo agregar parámetros TLS si está habilitado
            if USE_TLS:
                connection_params["tls"] = True
                if ALLOW_INVALID_CERTS:
                    connection_params["tlsAllowInvalidCertificates"] = True
            
            _client = MongoClient(MONGO_URI, **connection_params)
            logger.info(f"✅ Conectado a MongoDB (TLS: {USE_TLS})")
        except Exception as e:
            logger.error(f"❌ Error al conectar con MongoDB: {e}")
            raise
    return _client

def get_database():
    """Obtiene la base de datos"""
    global _db
    if _db is None:
        client = get_mongo_client()
        _db = client[MONGO_DB]
    return _db

def get_collection():
    """Obtiene la colección de gasolineras"""
    global _collection
    if _collection is None:
        db = get_database()
        _collection = db["gasolineras"]
    return _collection

def get_historico_collection():
    """Obtiene la colección de precios históricos"""
    global _collection_historico
    if _collection_historico is None:
        db = get_database()
        _collection_historico = db["precios_historicos"]
        # Crear índices para optimizar consultas
        _collection_historico.create_index([("IDEESS", 1), ("fecha", -1)])
        _collection_historico.create_index([("fecha", -1)])
    return _collection_historico

def test_db_connection():
    """Prueba la conexión a MongoDB"""
    try:
        client = get_mongo_client()
        client.admin.command('ping')
        return True
    except (ConnectionFailure, ServerSelectionTimeoutError) as e:
        logger.error(f"❌ Fallo al conectar con MongoDB: {e}")
        raise

def close_db_connection():
    """Cierra la conexión a MongoDB"""
    global _client, _db, _collection, _collection_historico
    if _client:
        _client.close()
        _client = None
        _db = None
        _collection = None
        _collection_historico = None
        logger.info("✅ Conexión a MongoDB cerrada")

# Función para compatibilidad con FastAPI Depends
def get_db():
    """Obtiene la base de datos para inyección de dependencias"""
    return get_database()
