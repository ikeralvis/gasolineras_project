"""
Gestión de conexión a MongoDB
"""
import os
import logging
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

logger = logging.getLogger(__name__)

# Variables de entorno
MONGO_HOST = os.getenv("MONGO_HOST", "mongo")
MONGO_PORT = int(os.getenv("MONGO_PORT", "27017"))
MONGO_USER = os.getenv("MONGO_USER", "")
MONGO_PASS = os.getenv("MONGO_PASS", "")
MONGO_DB = os.getenv("MONGO_DB", "gasolineras_db")

# Construir URI de conexión
if MONGO_USER and MONGO_PASS:
    MONGO_URI = f"mongodb://{MONGO_USER}:{MONGO_PASS}@{MONGO_HOST}:{MONGO_PORT}"
else:
    MONGO_URI = f"mongodb://{MONGO_HOST}:{MONGO_PORT}"

# Cliente global
_client = None
_db = None
_collection = None

def get_mongo_client():
    """Obtiene o crea el cliente de MongoDB"""
    global _client
    if _client is None:
        try:
            _client = MongoClient(
                MONGO_URI,
                serverSelectionTimeoutMS=5000,
                maxPoolSize=10,
                minPoolSize=1
            )
            logger.info(f"✅ Conectado a MongoDB en {MONGO_HOST}:{MONGO_PORT}")
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
    global _client, _db, _collection
    if _client:
        _client.close()
        _client = None
        _db = None
        _collection = None
        logger.info("✅ Conexión a MongoDB cerrada")

# Función para compatibilidad con FastAPI Depends
def get_db():
    """Obtiene la base de datos para inyección de dependencias"""
    return get_database()
