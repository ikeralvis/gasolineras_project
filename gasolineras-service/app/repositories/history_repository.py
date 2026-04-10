"""Repositorio SQL para historico de precios."""
import importlib
from datetime import date

from app.db.connection import get_db_conn, get_cursor

try:
    _psycopg2_extras = importlib.import_module("psycopg2.extras")
    execute_values = _psycopg2_extras.execute_values
except Exception:  # pragma: no cover
    execute_values = None


class HistoryRepository:
    def prune_before(self, retention_cutoff: date) -> int:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute("DELETE FROM precios_historicos WHERE fecha < %s", [retention_cutoff])
                return cur.rowcount

    def upsert_daily_prices(self, rows: list[tuple]) -> int:
        if not rows:
            return 0
        if execute_values is None:
            raise RuntimeError("psycopg2.extras.execute_values no disponible")

        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                execute_values(
                    cur,
                    """
                    INSERT INTO precios_historicos
                        (ideess, fecha, p95, p98, pa, pb, pp)
                    VALUES %s
                    ON CONFLICT (ideess, fecha) DO UPDATE SET
                        p95 = EXCLUDED.p95,
                        p98 = EXCLUDED.p98,
                        pa  = EXCLUDED.pa,
                        pb  = EXCLUDED.pb,
                        pp  = EXCLUDED.pp
                    """,
                    rows,
                )
        return len(rows)

    def get_history(self, ideess: str, fecha_desde: date, fecha_hasta: date) -> list[dict]:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(
                    """
                    SELECT ideess, fecha, p95, p98, pa, pb, pp
                    FROM precios_historicos
                    WHERE ideess = %s AND fecha BETWEEN %s AND %s
                    ORDER BY fecha ASC
                    """,
                    [ideess, fecha_desde, fecha_hasta],
                )
                return [dict(r) for r in cur.fetchall()]
