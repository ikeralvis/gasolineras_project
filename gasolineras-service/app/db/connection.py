"""
Gestión de conexión a PostgreSQL (Neon / local)
"""
import os
import logging
from contextlib import contextmanager

import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------
# Configuración
# Neon (y cualquier PostgreSQL cloud) requiere sslmode=require.
# En local con Docker puedes poner ?sslmode=disable en DATABASE_URL.
# -------------------------------------------------------------------
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL env var is not set. "
        "Set it to your Neon / Supabase PostgreSQL connection string."
    )

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _build_pool() -> psycopg2.pool.ThreadedConnectionPool:
    """Crea el pool de conexiones."""
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


def get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    """Obtiene (o crea) el pool de conexiones."""
    global _pool
    if _pool is None or _pool.closed:
        _pool = _build_pool()
    return _pool


@contextmanager
def get_db_conn():
    """
    Context manager que entrega una conexión del pool.
    Hace commit automático al salir; rollback si hay excepción.
    Siempre devuelve la conexión al pool al finalizar.
    """
    conn = get_pool().getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        get_pool().putconn(conn)


def get_cursor(conn):
    """Devuelve un cursor que retorna filas como diccionarios."""
    return conn.cursor(cursor_factory=RealDictCursor)


# -------------------------------------------------------------------
# Ciclo de vida (compatibilidad con main.py)
# -------------------------------------------------------------------

def test_db_connection() -> bool:
    """Prueba la conexión ejecutando una consulta trivial."""
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
