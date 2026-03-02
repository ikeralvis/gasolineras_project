"""
Rutas de la API de Gasolineras - PostgreSQL/PostGIS (Neon)
"""
import logging
import os
import httpx
from typing import Optional, Set
from datetime import datetime, timezone, timedelta, date

from fastapi import APIRouter, Query, HTTPException, status
from psycopg2.extras import execute_values, Json

from app.db.connection import get_db_conn, get_cursor
from app.services.fetch_gobierno import fetch_data_gobierno, parse_float
from app.models.gasolinera import Gasolinera

logger = logging.getLogger(__name__)

USUARIOS_SERVICE_URL = os.getenv("USUARIOS_SERVICE_URL", "http://usuarios:3001")
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "dev-internal-secret-change-in-production")

router = APIRouter(prefix="/gasolineras", tags=["Gasolineras"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt(val) -> str:
    """Convierte un NUMERIC de PG al formato espanol (coma decimal)."""
    if val is None:
        return ""
    return f"{float(val):.3f}".replace(".", ",")


def _row_to_api(row: dict) -> dict:
    """Mapea una fila de PostgreSQL al formato de campos que espera el cliente."""
    return {
        "IDEESS": row.get("ideess"),
        "R\u00f3tulo": row.get("rotulo") or "",
        "Municipio": row.get("municipio") or "",
        "Provincia": row.get("provincia") or "",
        "Direcci\u00f3n": row.get("direccion") or "",
        "Precio Gasolina 95 E5": _fmt(row.get("precio_95_e5")),
        "Precio Gasolina 98 E5": _fmt(row.get("precio_98_e5")),
        "Precio Gasoleo A": _fmt(row.get("precio_gasoleo_a")),
        "Precio Gasoleo B": _fmt(row.get("precio_gasoleo_b")),
        "Precio Gas\u00f3leo Premium": _fmt(row.get("precio_gasoleo_premium")),
        "Latitud": row.get("latitud"),
        "Longitud": row.get("longitud"),
        "Horario": row.get("horario"),
        "horario_parsed": row.get("horario_parsed"),
    }


# ---------------------------------------------------------------------------
# GET /gasolineras/
# ---------------------------------------------------------------------------
@router.get(
    "/",
    response_model=dict,
    summary="Obtener gasolineras",
    description="Obtiene la lista de gasolineras con soporte para filtros y paginaci\u00f3n.",
)
def get_gasolineras(
    provincia: Optional[str] = Query(None, description="Filtrar por provincia"),
    municipio: Optional[str] = Query(None, description="Filtrar por municipio"),
    precio_max: Optional[float] = Query(None, description="Precio m\u00e1ximo gasolina 95"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
):
    try:
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
                total = cur.fetchone()["total"]

                cur.execute(
                    f"SELECT * FROM gasolineras {where} OFFSET %s LIMIT %s",
                    params + [skip, limit],
                )
                rows = [dict(r) for r in cur.fetchall()]

        gasolineras_list = [_row_to_api(r) for r in rows]
        logger.info(f"\U0001f4ca Consultadas {len(gasolineras_list)} gasolineras (total: {total})")

        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "count": len(gasolineras_list),
            "gasolineras": gasolineras_list,
        }

    except Exception as e:
        logger.error(f"\u274c Error al obtener gasolineras: {e}")
        raise HTTPException(status_code=500, detail=f"Error al consultar las gasolineras: {e}")


# ---------------------------------------------------------------------------
# GET /gasolineras/cerca  (PostGIS ST_DWithin)
# ---------------------------------------------------------------------------
@router.get("/cerca", summary="Obtener gasolineras cercanas a una ubicaci\u00f3n")
def gasolineras_cerca(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    km: float = Query(50, gt=0, le=200),
    limit: int = Query(100, ge=1, le=500),
):
    try:
        sql = """
            SELECT
                ideess, rotulo, municipio, provincia, direccion,
                precio_95_e5, precio_98_e5, precio_gasoleo_a,
                precio_gasoleo_b, precio_gasoleo_premium,
                latitud, longitud, horario, horario_parsed,
                ST_Distance(geom, ST_MakePoint(%s, %s)::geography) / 1000.0 AS distancia_km
            FROM gasolineras
            WHERE geom IS NOT NULL
              AND ST_DWithin(geom, ST_MakePoint(%s, %s)::geography, %s)
            ORDER BY distancia_km
            LIMIT %s
        """
        # params: lon,lat (distancia), lon,lat (filtro), metros, limit
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(sql, [lon, lat, lon, lat, km * 1000, limit])
                rows = [dict(r) for r in cur.fetchall()]

        gasolineras_list = []
        for r in rows:
            g = _row_to_api(r)
            g["distancia_km"] = float(r["distancia_km"]) if r.get("distancia_km") is not None else None
            gasolineras_list.append(g)

        logger.info(f"\u2705 Encontradas {len(gasolineras_list)} gasolineras cercanas")
        return {
            "ubicacion": {"lat": lat, "lon": lon},
            "radio_km": km,
            "count": len(gasolineras_list),
            "gasolineras": gasolineras_list,
        }

    except Exception as e:
        logger.error(f"\u274c Error al buscar gasolineras cercanas: {e}")
        import traceback; logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error al buscar gasolineras cercanas: {e}")


# ---------------------------------------------------------------------------
# POST /gasolineras/sync
# ---------------------------------------------------------------------------
@router.post(
    "/sync",
    response_model=dict,
    summary="Sincronizar gasolineras desde la API del Gobierno de Espa\u00f1a",
)
def sync_gasolineras():
    try:
        logger.info("\U0001f504 Iniciando sincronizaci\u00f3n de gasolineras...")

        datos = fetch_data_gobierno()
        if not datos:
            raise HTTPException(status_code=503, detail="No se pudieron obtener datos desde la API del gobierno")

        logger.info(f"\U0001f4e6 Datos recibidos: {len(datos)} registros")

        datos_validos = [g for g in datos if g.get("Latitud") is not None and g.get("Longitud") is not None]
        logger.info(f"\U0001f522 V\u00e1lidos con coordenadas: {len(datos_validos)} / {len(datos)}")

        if not datos_validos:
            raise HTTPException(status_code=500, detail="No se encontraron gasolineras con coordenadas v\u00e1lidas")

        fecha_sync = datetime.now(timezone.utc)

        # ---------------------------------------------------------------
        # Batch INSERT con PostGIS
        # geom: WKT "POINT(lon lat)" -> ST_GeomFromText(%s, 4326)::geography
        # Nota: la API devuelve campos con nombres en espanol con tildes.
        # fetch_gobierno.py los guarda tal cual; aqui se accede por alias
        # sin tilde para compatibilidad con el resultado de parse_gasolinera.
        # ---------------------------------------------------------------
        rows = [
            (
                g.get("IDEESS"),
                (g.get("R\u00f3tulo") or "").strip(),
                (g.get("Municipio") or "").strip(),
                (g.get("Provincia") or "").strip(),
                (g.get("Direcci\u00f3n") or "").strip(),
                parse_float(g.get("Precio Gasolina 95 E5") or ""),
                parse_float(g.get("Precio Gasolina 98 E5") or ""),
                parse_float(g.get("Precio Gasoleo A") or ""),
                parse_float(g.get("Precio Gasoleo B") or ""),
                parse_float(g.get("Precio Gas\u00f3leo Premium") or ""),
                g.get("Latitud"),
                g.get("Longitud"),
                f"POINT({g['Longitud']} {g['Latitud']})",
                g.get("Horario"),
                Json(g["Horario_parsed"]) if g.get("Horario_parsed") else None,
                fecha_sync,
            )
            for g in datos_validos
        ]

        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute("DELETE FROM gasolineras")
                deleted_count = cur.rowcount

                execute_values(
                    cur,
                    """
                    INSERT INTO gasolineras
                        (ideess, rotulo, municipio, provincia, direccion,
                         precio_95_e5, precio_98_e5, precio_gasoleo_a,
                         precio_gasoleo_b, precio_gasoleo_premium,
                         latitud, longitud, geom,
                         horario, horario_parsed,
                         actualizado_en)
                    VALUES %s
                    """,
                    rows,
                    template=(
                        "(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,"
                        " ST_GeomFromText(%s, 4326)::geography, %s, %s, %s)"
                    ),
                )
                inserted_count = len(rows)
                logger.info(f"\u2705 Insertadas {inserted_count} gasolineras (eliminadas {deleted_count})")

                cur.execute(
                    "DELETE FROM precios_historicos WHERE fecha < %s",
                    [fecha_sync.date() - timedelta(days=30)],
                )

        # ---------------------------------------------------------------
        # Hist\u00f3rico - solo favoritas
        # ---------------------------------------------------------------
        favoritas_ids: Set[str] = set()
        try:
            response = httpx.get(
                f"{USUARIOS_SERVICE_URL}/api/usuarios/favoritos/all-ideess",
                headers={"X-Internal-Secret": INTERNAL_API_SECRET},
                timeout=10.0,
            )
            if response.status_code == 200:
                favoritas_ids = set(response.json().get("ideess", []))
                logger.info(f"\U0001f4cc {len(favoritas_ids)} IDEESS favoritos para hist\u00f3rico")
            else:
                logger.warning(f"\u26a0\ufe0f No se pudieron obtener favoritos: {response.status_code}")
        except Exception as e:
            logger.warning(f"\u26a0\ufe0f Error obteniendo favoritos (continuando sin hist\u00f3rico): {e}")

        historico_count = 0
        if favoritas_ids:
            fecha_hoy: date = fecha_sync.date()
            historico_rows = [
                (
                    g.get("IDEESS"),
                    fecha_hoy,
                    parse_float(g.get("Precio Gasolina 95 E5") or ""),
                    parse_float(g.get("Precio Gasolina 98 E5") or ""),
                    parse_float(g.get("Precio Gasoleo A") or ""),
                    parse_float(g.get("Precio Gasoleo B") or ""),
                    parse_float(g.get("Precio Gas\u00f3leo Premium") or ""),
                )
                for g in datos_validos
                if g.get("IDEESS") in favoritas_ids
            ]

            if historico_rows:
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
                            historico_rows,
                        )
                    historico_count = len(historico_rows)
                    logger.info(f"\U0001f4ca Guardados {historico_count} registros hist\u00f3ricos para {fecha_hoy}")

        return {
            "mensaje": "Datos sincronizados correctamente \U0001f680",
            "registros_eliminados": deleted_count,
            "registros_insertados": inserted_count,
            "registros_historicos": historico_count,
            "favoritas_totales": len(favoritas_ids),
            "fecha_snapshot": fecha_sync.date().isoformat(),
            "total": inserted_count,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"\u274c Error al sincronizar gasolineras: {e}")
        import traceback; logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error al sincronizar datos: {e}")


# ---------------------------------------------------------------------------
# GET /gasolineras/count
# ---------------------------------------------------------------------------
@router.get("/count", response_model=dict, summary="Contar gasolineras")
def count_gasolineras():
    try:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute("SELECT COUNT(*) AS total FROM gasolineras")
                total = cur.fetchone()["total"]
        return {"total": total, "mensaje": f"Total de gasolineras: {total}"}
    except Exception as e:
        logger.error(f"\u274c Error al contar gasolineras: {e}")
        raise HTTPException(status_code=500, detail=f"Error al contar gasolineras: {e}")


# ---------------------------------------------------------------------------
# GET /gasolineras/estadisticas
# ---------------------------------------------------------------------------
@router.get("/estadisticas", response_model=dict, summary="Obtener estad\u00edsticas de precios")
def obtener_estadisticas(
    provincia: Optional[str] = Query(None),
    municipio: Optional[str] = Query(None),
):
    try:
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
                    f"SELECT precio_95_e5, precio_98_e5, precio_gasoleo_a, "
                    f"precio_gasoleo_b, precio_gasoleo_premium FROM gasolineras {where}",
                    params,
                )
                rows = [dict(r) for r in cur.fetchall()]

        total = len(rows)
        if total == 0:
            raise HTTPException(status_code=404, detail="No se encontraron gasolineras con los filtros especificados")

        def calcular(campo: str):
            precios = sorted(float(r[campo]) for r in rows if r.get(campo) is not None and float(r[campo]) > 0)
            if not precios:
                return None
            n = len(precios)
            return {
                "min": round(precios[0], 3),
                "max": round(precios[-1], 3),
                "media": round(sum(precios) / n, 3),
                "mediana": round(precios[n // 2], 3),
                "p25": round(precios[n // 4], 3),
                "p75": round(precios[n * 3 // 4], 3),
                "total_muestras": n,
            }

        estadisticas = {
            "total_gasolineras": total,
            "filtros": {"provincia": provincia, "municipio": municipio},
            "combustibles": {
                k: v for k, v in {
                    "gasolina_95": calcular("precio_95_e5"),
                    "gasolina_98": calcular("precio_98_e5"),
                    "gasoleo_a": calcular("precio_gasoleo_a"),
                    "gasoleo_b": calcular("precio_gasoleo_b"),
                    "gasoleo_premium": calcular("precio_gasoleo_premium"),
                }.items() if v is not None
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        logger.info(f"\U0001f4ca Estad\u00edsticas calculadas para {total} gasolineras")
        return estadisticas

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"\u274c Error al calcular estad\u00edsticas: {e}")
        import traceback; logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error al calcular estad\u00edsticas: {e}")


# ---------------------------------------------------------------------------
# GET /gasolineras/{id}
# ---------------------------------------------------------------------------
@router.get("/{id}", response_model=Gasolinera, summary="Obtener detalles de una gasolinera por ID")
def get_gasolinera_por_id(id: str):
    try:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute("SELECT * FROM gasolineras WHERE ideess = %s", [id])
                row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"No se encontr\u00f3 gasolinera con ID {id}")

        return _row_to_api(dict(row))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"\u274c Error al obtener gasolinera {id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno al consultar la gasolinera: {e}")


# ---------------------------------------------------------------------------
# GET /gasolineras/{id}/cercanas  (PostGIS ST_DWithin)
# ---------------------------------------------------------------------------
@router.get("/{id}/cercanas", summary="Obtener gasolineras cercanas a otra gasolinera")
def get_gasolineras_cercanas(id: str, radio_km: float = 5):
    try:
        sql = """
            SELECT
                g.ideess, g.rotulo, g.municipio, g.provincia, g.direccion,
                g.precio_95_e5, g.precio_98_e5, g.precio_gasoleo_a,
                g.precio_gasoleo_b, g.precio_gasoleo_premium,
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
        """
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(sql, [id, id, radio_km * 1000])
                rows = [dict(r) for r in cur.fetchall()]

        if not rows:
            with get_db_conn() as conn:
                with get_cursor(conn) as cur:
                    cur.execute("SELECT 1 FROM gasolineras WHERE ideess = %s", [id])
                    if not cur.fetchone():
                        raise HTTPException(status_code=404, detail=f"No se encontr\u00f3 gasolinera con ID {id}")

        cercanas = []
        for r in rows:
            g = _row_to_api(r)
            g["distancia_km"] = float(r["distancia_km"]) if r.get("distancia_km") is not None else None
            cercanas.append(g)

        return {"origen": id, "radio_km": radio_km, "cantidad": len(cercanas), "gasolineras_cercanas": cercanas}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"\u274c Error al obtener gasolineras cercanas para {id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al consultar gasolineras cercanas: {e}")


# ---------------------------------------------------------------------------
# GET /gasolineras/{id}/historial
# ---------------------------------------------------------------------------
@router.get("/{id}/historial", summary="Obtener historial de precios de una gasolinera")
def get_historial_precios(id: str, dias: int = Query(default=30, ge=1, le=365)):
    try:
        fecha_hasta = datetime.now(timezone.utc).date()
        fecha_desde = fecha_hasta - timedelta(days=dias)

        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(
                    """
                    SELECT ideess, fecha, p95, p98, pa, pb, pp
                    FROM precios_historicos
                    WHERE ideess = %s AND fecha BETWEEN %s AND %s
                    ORDER BY fecha ASC
                    """,
                    [id, fecha_desde, fecha_hasta],
                )
                registros = [dict(r) for r in cur.fetchall()]

                if not registros:
                    cur.execute("SELECT 1 FROM gasolineras WHERE ideess = %s", [id])
                    if not cur.fetchone():
                        raise HTTPException(status_code=404, detail=f"No se encontr\u00f3 gasolinera con ID {id}")

        for r in registros:
            if isinstance(r.get("fecha"), date):
                r["fecha"] = r["fecha"].isoformat()

        return {
            "IDEESS": id,
            "dias_consultados": dias,
            "fecha_desde": fecha_desde.isoformat(),
            "fecha_hasta": fecha_hasta.isoformat(),
            "registros": len(registros),
            "historial": registros,
            **({"mensaje": "No hay datos hist\u00f3ricos disponibles para este per\u00edodo"} if not registros else {}),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"\u274c Error al obtener historial de precios para {id}: {e}")
        import traceback; logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error al consultar historial: {e}")
