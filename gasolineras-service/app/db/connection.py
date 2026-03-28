"""
Gestión de conexión a PostgreSQL (Neon / local)
"""
import os
import logging
from contextlib import contextmanager
from typing import Any

try:
    import psycopg2
    import psycopg2.pool
    from psycopg2.extras import RealDictCursor
    _HAS_PSYCOPG2 = True
except Exception:  # pragma: no cover - depende del entorno
    psycopg2 = None
    RealDictCursor = None
    _HAS_PSYCOPG2 = False

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------
# Configuración
# Neon (y cualquier PostgreSQL cloud) requiere sslmode=require.
# En local con Docker puedes poner ?sslmode=disable en DATABASE_URL.
# -------------------------------------------------------------------
DATABASE_URL = os.environ.get("DATABASE_URL")


def is_db_configured() -> bool:
    """Indica si hay configuración para PostgreSQL en el entorno."""
    return _HAS_PSYCOPG2 and bool(DATABASE_URL)

_pool: Any | None = None


def _build_pool():
    """Crea el pool de conexiones."""
    if not _HAS_PSYCOPG2:
        raise RuntimeError("psycopg2 no está disponible en este entorno")
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL env var is not set")

    dsn = DATABASE_URL
    # Añadimos sslmode=require para Neon si no está ya especificado
    if "sslmode" not in dsn:
        connector = "&" if "?" in dsn else "?"
        dsn = dsn + connector + "sslmode=require"

    logger.info("🔌 Creando pool de conexiones PostgreSQL...")
    return psycopg2.pool.ThreadedConnectionPool(
        minconn=1,
        maxconn=10,
        dsn=dsn,
    )


def get_pool():
    """Obtiene (o crea) el pool de conexiones."""
    global _pool
    if not is_db_configured():
        raise RuntimeError("PostgreSQL no configurado (DATABASE_URL/psycopg2)")

    if _pool is None or _pool.closed:
        _pool = _build_pool()
    return _pool


def _acquire_connection():
    """Obtiene una conexión viva del pool y recrea el pool si quedó inválido."""
    pool = get_pool()
    conn = pool.getconn()

    # Neon puede cerrar conexiones inactivas; descartamos y pedimos una nueva.
    if conn.closed:
        pool.putconn(conn, close=True)
        conn = pool.getconn()

    # Si aún llega cerrada, recreamos el pool completo y reintentamos una vez.
    if conn.closed:
        logger.warning("♻️ Reiniciando pool PostgreSQL tras conexión cerrada")
        pool.closeall()
        global _pool
        _pool = None
        conn = get_pool().getconn()

    return conn


@contextmanager
def get_db_conn():
    """
    Context manager que entrega una conexión del pool.
    Hace commit automático al salir; rollback si hay excepción.
    Siempre devuelve la conexión al pool al finalizar.
    """
    conn = _acquire_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        if not conn.closed:
            conn.rollback()
        raise
    finally:
        # Nunca devolvemos conexiones cerradas al pool para evitar reutilización rota.
        if conn.closed:
            get_pool().putconn(conn, close=True)
        else:
            get_pool().putconn(conn)


def get_cursor(conn):
    """Devuelve un cursor que retorna filas como diccionarios."""
    if RealDictCursor is None:
        raise RuntimeError("RealDictCursor no disponible (psycopg2 no instalado)")
    return conn.cursor(cursor_factory=RealDictCursor)


# -------------------------------------------------------------------
# Ciclo de vida (compatibilidad con main.py)
# -------------------------------------------------------------------

def test_db_connection() -> bool:
    """Prueba la conexión ejecutando una consulta trivial."""
    if not is_db_configured():
        raise RuntimeError("PostgreSQL no configurado")

    with get_db_conn() as conn:
        with get_cursor(conn) as cur:
            cur.execute("SELECT 1")
    logger.info("✅ Conexión a PostgreSQL verificada")
    return True


def close_db_connection():
    """Cierra todas las conexiones del pool."""
    global _pool
    if _pool and not _pool.closed:
        _pool.closeall()
        _pool = None
        logger.info("✅ Pool de conexiones PostgreSQL cerrado")
