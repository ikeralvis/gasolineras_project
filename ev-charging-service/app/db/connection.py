"""
PostgreSQL connection pool for ev-charging-service.
Same pattern as gasolineras-service — compatible with Neon (sslmode=require).
"""
import os
import logging
from contextlib import contextmanager

import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL env var is not set. "
        "Set it to your Neon / Supabase PostgreSQL connection string."
    )

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _build_pool() -> psycopg2.pool.ThreadedConnectionPool:
    dsn = DATABASE_URL
    if "sslmode" not in dsn:
        connector = "&" if "?" in dsn else "?"
        dsn = dsn + connector + "sslmode=require"

    logger.info("🔌 Creating PostgreSQL connection pool (ev-charging)...")
    return psycopg2.pool.ThreadedConnectionPool(minconn=1, maxconn=5, dsn=dsn)


def get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None or _pool.closed:
        _pool = _build_pool()
    return _pool


@contextmanager
def get_db_conn():
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
    return conn.cursor(cursor_factory=RealDictCursor)


def test_db_connection() -> bool:
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
    logger.info("✅ PostgreSQL connection verified (ev-charging)")
    return True


def close_db_connection():
    global _pool
    if _pool and not _pool.closed:
        _pool.closeall()
        _pool = None
        logger.info("✅ PostgreSQL pool closed (ev-charging)")
