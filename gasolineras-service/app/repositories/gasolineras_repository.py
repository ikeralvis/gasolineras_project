"""Repositorio SQL/PostGIS para entidad Gasolinera."""
import importlib
from datetime import datetime
from typing import Optional

from app.db.connection import get_db_conn, get_cursor

try:
    _psycopg2_extras = importlib.import_module("psycopg2.extras")
    execute_values = _psycopg2_extras.execute_values
except Exception:  # pragma: no cover
    execute_values = None


class GasolinerasRepository:
    def get_snapshot_state(self) -> dict:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(
                    """
                    SELECT COUNT(*) AS total, MAX(actualizado_en) AS last_sync_at
                    FROM gasolineras
                    """
                )
                row_raw = cur.fetchone()

        row = dict(row_raw) if row_raw else {}
        return {
            "total": int(row.get("total") or 0),
            "last_sync_at": row.get("last_sync_at"),
        }

    def replace_snapshot(self, rows: list[tuple]) -> tuple[int, int]:
        if execute_values is None:
            raise RuntimeError("psycopg2.extras.execute_values no disponible")

        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute("DELETE FROM gasolineras")
                deleted_count = cur.rowcount

                execute_values(
                    cur,
                    """
                    INSERT INTO gasolineras
                        (ideess, rotulo, municipio, provincia, direccion,
                         precio_95_e5, precio_95_e5_premium, precio_98_e5,
                         precio_gasoleo_a, precio_gasoleo_b,
                         precio_gasoleo_premium, precio_diesel_renovable,
                         latitud, longitud, geom,
                         horario, horario_parsed,
                         actualizado_en)
                    VALUES %s
                    """,
                    rows,
                    template=(
                        "(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,"
                        " %s, %s, ST_GeomFromText(%s, 4326)::geography, %s, %s, %s)"
                    ),
                )

                inserted_count = len(rows)

        return deleted_count, inserted_count

    def list_rows(
        self,
        provincia: Optional[str],
        municipio: Optional[str],
        precio_max: Optional[float],
        skip: int,
        limit: int,
    ) -> tuple[int, list[dict]]:
        conditions: list[str] = []
        params: list = []

        if provincia:
            conditions.append("provincia ILIKE %s")
            params.append(f"%{provincia}%")
        if municipio:
            conditions.append("municipio ILIKE %s")
            params.append(f"%{municipio}%")
        if precio_max is not None:
            conditions.append("precio_95_e5 <= %s")
            params.append(precio_max)

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(f"SELECT COUNT(*) AS total FROM gasolineras {where}", params)
                count_row = cur.fetchone() or {"total": 0}
                total = int(count_row["total"])

                cur.execute(
                    f"SELECT * FROM gasolineras {where} OFFSET %s LIMIT %s",
                    params + [skip, limit],
                )
                rows = [dict(r) for r in cur.fetchall()]

        return total, rows

    def cluster_markers(self, lon_sw: float, lat_sw: float, lon_ne: float, lat_ne: float, grid_size: float) -> list[dict]:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(
                    """
                    WITH filtered AS (
                        SELECT geom, precio_95_e5
                        FROM gasolineras
                        WHERE geom IS NOT NULL
                          AND ST_Intersects(
                              geom::geometry,
                              ST_MakeEnvelope(%s, %s, %s, %s, 4326)
                          )
                    ), grouped AS (
                        SELECT
                            ST_SnapToGrid(geom::geometry, %s, %s) AS grid_geom,
                            COUNT(*)::int AS total,
                            MIN(precio_95_e5) AS min_precio_95_e5,
                            (ARRAY_AGG(geom::geometry ORDER BY precio_95_e5 ASC NULLS LAST))[1] AS representative_geom
                        FROM filtered
                        GROUP BY grid_geom
                    )
                    SELECT
                        ST_Y(representative_geom) AS latitude,
                        ST_X(representative_geom) AS longitude,
                        total,
                        min_precio_95_e5
                    FROM grouped
                    ORDER BY total DESC
                    LIMIT 1500
                    """,
                    [lon_sw, lat_sw, lon_ne, lat_ne, grid_size, grid_size],
                )
                return [dict(r) for r in cur.fetchall()]

    def station_markers(self, lon_sw: float, lat_sw: float, lon_ne: float, lat_ne: float) -> list[dict]:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(
                    """
                    SELECT
                        ideess, rotulo, municipio, provincia, direccion,
                        precio_95_e5, precio_95_e5_premium, precio_98_e5,
                        precio_gasoleo_a, precio_gasoleo_b,
                        precio_gasoleo_premium, precio_diesel_renovable,
                        latitud, longitud, horario, horario_parsed
                    FROM gasolineras
                    WHERE geom IS NOT NULL
                      AND ST_Intersects(
                          geom::geometry,
                          ST_MakeEnvelope(%s, %s, %s, %s, 4326)
                      )
                    ORDER BY precio_95_e5 NULLS LAST, ideess
                    LIMIT 2000
                    """,
                    [lon_sw, lat_sw, lon_ne, lat_ne],
                )
                return [dict(r) for r in cur.fetchall()]

    def nearby_rows(self, lat: float, lon: float, km: float, limit: int) -> list[dict]:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(
                    """
                    SELECT
                        ideess, rotulo, municipio, provincia, direccion,
                        precio_95_e5, precio_95_e5_premium, precio_98_e5,
                        precio_gasoleo_a, precio_gasoleo_b,
                        precio_gasoleo_premium, precio_diesel_renovable,
                        latitud, longitud, horario, horario_parsed,
                        ST_Distance(geom, ST_MakePoint(%s, %s)::geography) / 1000.0 AS distancia_km
                    FROM gasolineras
                    WHERE geom IS NOT NULL
                      AND ST_DWithin(geom, ST_MakePoint(%s, %s)::geography, %s)
                    ORDER BY distancia_km
                    LIMIT %s
                    """,
                    [lon, lat, lon, lat, km * 1000, limit],
                )
                return [dict(r) for r in cur.fetchall()]

    def count(self) -> int:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute("SELECT COUNT(*) AS total FROM gasolineras")
                row = cur.fetchone() or {"total": 0}
                return int(row["total"])

    def detail_row(self, ideess: str) -> Optional[dict]:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute("SELECT * FROM gasolineras WHERE ideess = %s", [ideess])
                row = cur.fetchone()
        return dict(row) if row else None

    def stats_rows(self, provincia: Optional[str], municipio: Optional[str]) -> list[dict]:
        conditions: list[str] = []
        params: list = []
        if provincia:
            conditions.append("provincia ILIKE %s")
            params.append(f"%{provincia}%")
        if municipio:
            conditions.append("municipio ILIKE %s")
            params.append(f"%{municipio}%")

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(
                    f"SELECT precio_95_e5, precio_95_e5_premium, precio_98_e5, "
                    f"precio_gasoleo_a, precio_gasoleo_b, precio_gasoleo_premium, "
                    f"precio_diesel_renovable FROM gasolineras {where}",
                    params,
                )
                return [dict(r) for r in cur.fetchall()]

    def nearby_by_id_rows(self, ideess: str, radio_km: float) -> list[dict]:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(
                    """
                    SELECT
                        g.ideess, g.rotulo, g.municipio, g.provincia, g.direccion,
                        g.precio_95_e5, g.precio_95_e5_premium, g.precio_98_e5,
                        g.precio_gasoleo_a, g.precio_gasoleo_b,
                        g.precio_gasoleo_premium, g.precio_diesel_renovable,
                        g.latitud, g.longitud, g.horario, g.horario_parsed,
                        ST_Distance(g.geom, ref.geom) / 1000.0 AS distancia_km
                    FROM gasolineras g, gasolineras ref
                    WHERE ref.ideess = %s
                      AND g.ideess != %s
                      AND g.geom IS NOT NULL
                      AND ref.geom IS NOT NULL
                      AND ST_DWithin(g.geom, ref.geom, %s)
                    ORDER BY distancia_km
                    LIMIT 10
                    """,
                    [ideess, ideess, radio_km * 1000],
                )
                return [dict(r) for r in cur.fetchall()]

    def station_exists(self, ideess: str) -> bool:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute("SELECT 1 FROM gasolineras WHERE ideess = %s", [ideess])
                return bool(cur.fetchone())

    def snapshot_export_rows(self) -> list[dict]:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(
                    """
                    SELECT
                        ideess,
                        rotulo,
                        municipio,
                        provincia,
                        direccion,
                        precio_95_e5,
                        precio_95_e5_premium,
                        precio_98_e5,
                        precio_gasoleo_a,
                        precio_gasoleo_b,
                        precio_gasoleo_premium,
                        precio_diesel_renovable,
                        latitud,
                        longitud,
                        horario,
                        horario_parsed,
                        actualizado_en
                    FROM gasolineras
                    """
                )
                return [dict(r) for r in cur.fetchall()]
