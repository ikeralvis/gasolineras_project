"""
Rutas de la API de Gasolineras - PostgreSQL/PostGIS (Neon)
"""
import logging
import os
import threading
import traceback
import io
import httpx
import importlib
from typing import Optional, Set, Annotated
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo
from math import radians, sin, cos, sqrt, atan2

from fastapi import APIRouter, Query, HTTPException, Header
from pydantic import BaseModel, Field

try:
    _psycopg2_extras = importlib.import_module("psycopg2.extras")
    execute_values = _psycopg2_extras.execute_values
    Json = _psycopg2_extras.Json
    _HAS_PSYCOPG2 = True
except Exception:  # pragma: no cover - depende del entorno local
    execute_values = None
    Json = lambda value: value
    _HAS_PSYCOPG2 = False

from app.db.connection import get_db_conn, get_cursor, is_db_configured
from app.services.fetch_gobierno import fetch_data_gobierno, parse_float
from app.models.gasolinera import Gasolinera

logger = logging.getLogger(__name__)

USUARIOS_SERVICE_URL = os.getenv("USUARIOS_SERVICE_URL", "http://usuarios:3001")
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "dev-internal-secret-change-in-production")
AUTO_SYNC_ON_READ = os.getenv("AUTO_SYNC_ON_READ", "false").lower() == "true"
AUTO_SYNC_COOLDOWN_MINUTES = int(os.getenv("AUTO_SYNC_COOLDOWN_MINUTES", "30"))
HISTORICAL_SCOPE = os.getenv("HISTORICAL_SCOPE", "all").lower()
RAW_EXPORT_ENABLED = os.getenv("RAW_EXPORT_ENABLED", "false").lower() == "true"
RAW_EXPORT_GCS_BUCKET = os.getenv("RAW_EXPORT_GCS_BUCKET", "").strip()
RAW_EXPORT_GCS_PREFIX = os.getenv("RAW_EXPORT_GCS_PREFIX", "raw/").strip() or "raw/"
RAW_EXPORT_PARQUET_COMPRESSION = os.getenv("RAW_EXPORT_PARQUET_COMPRESSION", "snappy").strip() or "snappy"

KEY_DIRECCION = "Dirección"
KEY_ROTULO = "Rótulo"
KEY_P95 = "Precio Gasolina 95 E5"
KEY_P98 = "Precio Gasolina 98 E5"
KEY_GASOLEO_A = "Precio Gasoleo A"
KEY_GASOLEO_B = "Precio Gasoleo B"
KEY_GASOLEO_PREMIUM = "Precio Gasóleo Premium"

_sync_lock = threading.Lock()
_last_auto_sync_attempt: Optional[datetime] = None

_memory_snapshot_rows: list[dict] = []
_memory_history: dict[str, list[dict]] = {}
_memory_last_sync_at: Optional[datetime] = None
_memory_mode = os.getenv("FORCE_MEMORY_MODE", "false").lower() == "true"

try:
    SPAIN_TZ = ZoneInfo("Europe/Madrid")
except Exception:
    SPAIN_TZ = timezone.utc

router = APIRouter(prefix="/gasolineras", tags=["Gasolineras"])


class MarkersViewport(BaseModel):
    lat_ne: float = Field(..., ge=-90, le=90)
    lon_ne: float = Field(..., ge=-180, le=180)
    lat_sw: float = Field(..., ge=-90, le=90)
    lon_sw: float = Field(..., ge=-180, le=180)
    zoom: int = Field(..., ge=0, le=22)


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
    rotulo = row.get("rotulo") or ""
    return {
        "IDEESS": row.get("ideess"),
        "Rotulo": rotulo,
        KEY_ROTULO: rotulo,
        "Municipio": row.get("municipio") or "",
        "Provincia": row.get("provincia") or "",
        KEY_DIRECCION: row.get("direccion") or "",
        KEY_P95: _fmt(row.get("precio_95_e5")),
        KEY_P98: _fmt(row.get("precio_98_e5")),
        KEY_GASOLEO_A: _fmt(row.get("precio_gasoleo_a")),
        KEY_GASOLEO_B: _fmt(row.get("precio_gasoleo_b")),
        "Precio Gasoleo Premium": _fmt(row.get("precio_gasoleo_premium")),
        "Latitud": row.get("latitud"),
        "Longitud": row.get("longitud"),
        "Horario": row.get("horario"),
        "horario_parsed": row.get("horario_parsed"),
    }


def _grid_size_for_zoom(zoom: int) -> Optional[float]:
    """Tamano de celda en grados para clustering segun zoom."""
    if zoom <= 5:
        return 0.45
    if zoom <= 6:
        return 0.32
    if zoom <= 7:
        return 0.24
    if zoom <= 8:
        return 0.16
    if zoom <= 9:
        return 0.11
    if zoom <= 10:
        return 0.075
    if zoom <= 11:
        return 0.05
    if zoom <= 12:
        return 0.032
    if zoom <= 13:
        return 0.02
    if zoom <= 14:
        return 0.012
    if zoom <= 15:
        return 0.007
    return None


def _activate_memory_mode(reason: str):
    global _memory_mode
    if not _memory_mode:
        logger.warning("⚠️ Activando modo fallback en memoria: %s", reason)
    _memory_mode = True


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return r * 2 * atan2(sqrt(a), sqrt(1 - a))


def _memory_row_from_source(g: dict, fecha_sync: datetime) -> dict:
    return {
        "ideess": g.get("IDEESS"),
        "rotulo": (g.get(KEY_ROTULO) or "").strip(),
        "municipio": (g.get("Municipio") or "").strip(),
        "provincia": (g.get("Provincia") or "").strip(),
        "direccion": (g.get(KEY_DIRECCION) or "").strip(),
        "precio_95_e5": parse_float(g.get(KEY_P95) or ""),
        "precio_98_e5": parse_float(g.get(KEY_P98) or ""),
        "precio_gasoleo_a": parse_float(g.get(KEY_GASOLEO_A) or ""),
        "precio_gasoleo_b": parse_float(g.get(KEY_GASOLEO_B) or ""),
        "precio_gasoleo_premium": parse_float(g.get(KEY_GASOLEO_PREMIUM) or ""),
        "latitud": g.get("Latitud"),
        "longitud": g.get("Longitud"),
        "horario": g.get("Horario"),
        "horario_parsed": g.get("Horario_parsed"),
        "actualizado_en": fecha_sync,
    }


def _memory_filter_rows(
    provincia: Optional[str] = None,
    municipio: Optional[str] = None,
    precio_max: Optional[float] = None,
) -> list[dict]:
    rows = _memory_snapshot_rows
    if provincia:
        p = provincia.lower()
        rows = [r for r in rows if p in (r.get("provincia") or "").lower()]
    if municipio:
        m = municipio.lower()
        rows = [r for r in rows if m in (r.get("municipio") or "").lower()]
    if precio_max is not None:
        rows = [r for r in rows if r.get("precio_95_e5") is not None and float(r["precio_95_e5"]) <= precio_max]
    return rows


def _ensure_memory_snapshot_loaded(reason: str = "read"):
    global _memory_last_sync_at

    if _memory_snapshot_rows:
        return
    logger.info("ℹ️ Cargando snapshot en memoria (%s)", reason)
    try:
        _perform_sync(trigger=f"memory-bootstrap:{reason}")
    except Exception as exc:
        logger.warning("⚠️ No se pudo bootstrapear snapshot en memoria (%s): %s", reason, exc)
        _memory_last_sync_at = datetime.now(timezone.utc)


def _get_snapshot_state() -> dict:
    if _memory_mode:
        total = len(_memory_snapshot_rows)
        last_sync_at = _memory_last_sync_at
        today_local = datetime.now(SPAIN_TZ).date()
        snapshot_date_local = None
        is_current = False
        if last_sync_at is not None:
            snapshot_date_local = last_sync_at.astimezone(SPAIN_TZ).date()
            is_current = snapshot_date_local == today_local
        return {
            "total": total,
            "last_sync_at": last_sync_at,
            "snapshot_date_local": snapshot_date_local,
            "today_local": today_local,
            "is_current": is_current,
        }

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

    total = int(row.get("total") or 0)
    last_sync_at = row.get("last_sync_at")
    today_local = datetime.now(SPAIN_TZ).date()
    snapshot_date_local = None
    is_current = False
    if last_sync_at is not None:
        snapshot_date_local = last_sync_at.astimezone(SPAIN_TZ).date()
        is_current = snapshot_date_local == today_local

    return {
        "total": total,
        "last_sync_at": last_sync_at,
        "snapshot_date_local": snapshot_date_local,
        "today_local": today_local,
        "is_current": is_current,
    }


def _prepare_sync_rows(datos: list[dict], fecha_sync: datetime) -> tuple[list[dict], list[tuple]]:
    if not datos:
        raise HTTPException(status_code=500, detail="No se pudieron obtener datos desde la API del gobierno")

    logger.info("📦 Datos recibidos: %s registros", len(datos))
    datos_validos = [g for g in datos if g.get("Latitud") is not None and g.get("Longitud") is not None]
    logger.info("🔢 Válidos con coordenadas: %s / %s", len(datos_validos), len(datos))

    if not datos_validos:
        raise HTTPException(status_code=500, detail="No se encontraron gasolineras con coordenadas válidas")

    rows = [
        (
            g.get("IDEESS"),
            (g.get(KEY_ROTULO) or "").strip(),
            (g.get("Municipio") or "").strip(),
            (g.get("Provincia") or "").strip(),
            (g.get(KEY_DIRECCION) or "").strip(),
            parse_float(g.get(KEY_P95) or ""),
            parse_float(g.get(KEY_P98) or ""),
            parse_float(g.get(KEY_GASOLEO_A) or ""),
            parse_float(g.get(KEY_GASOLEO_B) or ""),
            parse_float(g.get(KEY_GASOLEO_PREMIUM) or ""),
            g.get("Latitud"),
            g.get("Longitud"),
            f"POINT({g['Longitud']} {g['Latitud']})",
            g.get("Horario"),
            Json(g["Horario_parsed"]) if g.get("Horario_parsed") else None,
            fecha_sync,
        )
        for g in datos_validos
    ]
    return datos_validos, rows


def _update_memory_history(fecha_sync: datetime) -> int:
    fecha_hoy = fecha_sync.date()
    historico_count = 0
    for row in _memory_snapshot_rows:
        ideess = row.get("ideess")
        if not ideess:
            continue
        history = _memory_history.setdefault(ideess, [])
        history = [h for h in history if h.get("fecha") != fecha_hoy]
        history.append(
            {
                "ideess": ideess,
                "fecha": fecha_hoy,
                "p95": row.get("precio_95_e5"),
                "p98": row.get("precio_98_e5"),
                "pa": row.get("precio_gasoleo_a"),
                "pb": row.get("precio_gasoleo_b"),
                "pp": row.get("precio_gasoleo_premium"),
            }
        )
        _memory_history[ideess] = history[-30:]
        historico_count += 1
    return historico_count


def _sync_to_memory(datos_validos: list[dict], fecha_sync: datetime, update_history: bool) -> int:
    global _memory_snapshot_rows
    global _memory_last_sync_at

    _memory_snapshot_rows = [_memory_row_from_source(g, fecha_sync) for g in datos_validos]
    _memory_last_sync_at = fecha_sync
    if not update_history:
        return 0
    return _update_memory_history(fecha_sync)


def _memory_sync_result(
    trigger: str,
    fecha_sync: datetime,
    inserted_count: int,
    historico_count: int,
    warning: Optional[str] = None,
) -> dict:
    response = {
        "registros_eliminados": 0,
        "registros_insertados": inserted_count,
        "registros_historicos": historico_count,
        "historico_scope": HISTORICAL_SCOPE,
        "favoritas_totales": 0,
        "fecha_snapshot": fecha_sync.date().isoformat(),
        "total": inserted_count,
        "trigger": trigger,
        "storage_mode": "memory-fallback",
    }

    if warning:
        response["mensaje"] = "Datos sincronizados con fallback en memoria 🚀"
        response["warning"] = warning
    else:
        response["mensaje"] = "Datos sincronizados correctamente 🚀"
    return response


def _persist_snapshot_to_postgres(rows: list[tuple], fecha_sync: datetime) -> tuple[int, int]:
    with get_db_conn() as conn:
        with get_cursor(conn) as cur:
            cur.execute("DELETE FROM gasolineras")
            deleted_count = cur.rowcount

            if execute_values is None:
                raise RuntimeError("psycopg2.extras.execute_values no disponible")

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
            logger.info("✅ Insertadas %s gasolineras (eliminadas %s)", inserted_count, deleted_count)
            cur.execute(
                "DELETE FROM precios_historicos WHERE fecha < %s",
                [fecha_sync.date() - timedelta(days=30)],
            )

    return deleted_count, inserted_count


def _fetch_favoritas_ids() -> Set[str]:
    if HISTORICAL_SCOPE != "favoritas":
        return set()

    try:
        response = httpx.get(
            f"{USUARIOS_SERVICE_URL}/api/usuarios/favoritos/all-ideess",
            headers={"X-Internal-Secret": INTERNAL_API_SECRET},
            timeout=10.0,
        )
        if response.status_code == 200:
            favoritas_ids = set(response.json().get("ideess", []))
            logger.info("📌 %s IDEESS favoritos para histórico", len(favoritas_ids))
            return favoritas_ids
        logger.warning("⚠️ No se pudieron obtener favoritos: %s", response.status_code)
    except Exception as exc:
        logger.warning("⚠️ Error obteniendo favoritos (continuando sin histórico): %s", exc)

    return set()


def _validate_internal_secret(x_internal_secret: Optional[str]) -> None:
    if x_internal_secret != INTERNAL_API_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


def _normalize_prefix(prefix: str) -> str:
    clean = prefix.strip().strip("/")
    return f"{clean}/" if clean else ""


def _format_price_for_export(value) -> str:
    if value is None:
        return ""
    try:
        return f"{float(value):.3f}".replace(".", ",")
    except Exception:
        return ""


def _load_raw_export_deps():
    try:
        pyarrow = importlib.import_module("pyarrow")
        parquet = importlib.import_module("pyarrow.parquet")
        storage = importlib.import_module("google.cloud.storage")
        return pyarrow, parquet, storage
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Dependencias de exportación no disponibles. "
                "Instala pyarrow y google-cloud-storage en gasolineras-service. "
                f"Detalle: {exc}"
            ),
        )


def _build_export_record(base: dict, fecha_registro_ms: int) -> dict:
    return {
        "IDEESS": str(base.get("ideess") or "").strip(),
        KEY_ROTULO: base.get("rotulo") or "",
        "Municipio": base.get("municipio") or "",
        "Provincia": base.get("provincia") or "",
        KEY_DIRECCION: base.get("direccion") or "",
        KEY_P95: _format_price_for_export(base.get("precio_95_e5")),
        KEY_P98: _format_price_for_export(base.get("precio_98_e5")),
        KEY_GASOLEO_A: _format_price_for_export(base.get("precio_gasoleo_a")),
        KEY_GASOLEO_B: _format_price_for_export(base.get("precio_gasoleo_b")),
        KEY_GASOLEO_PREMIUM: _format_price_for_export(base.get("precio_gasoleo_premium")),
        "Latitud": base.get("latitud"),
        "Longitud": base.get("longitud"),
        "Horario": base.get("horario"),
        "Horario_parsed": base.get("horario_parsed"),
        "fecha_registro": fecha_registro_ms,
    }


def _snapshot_rows_for_export_memory() -> tuple[list[dict], datetime]:
    _ensure_memory_snapshot_loaded("export-raw")
    if not _memory_snapshot_rows:
        raise HTTPException(status_code=404, detail="No hay snapshot en memoria para exportar")

    reference_dt = _memory_last_sync_at or datetime.now(timezone.utc)
    fecha_registro_ms = int(reference_dt.timestamp() * 1000)
    records = [_build_export_record(row, fecha_registro_ms) for row in _memory_snapshot_rows]
    return records, reference_dt


def _snapshot_rows_for_export_postgres() -> tuple[list[dict], datetime]:
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
                    precio_98_e5,
                    precio_gasoleo_a,
                    precio_gasoleo_b,
                    precio_gasoleo_premium,
                    latitud,
                    longitud,
                    horario,
                    horario_parsed,
                    actualizado_en
                FROM gasolineras
                """
            )
            rows = [dict(r) for r in cur.fetchall()]

    if not rows:
        raise HTTPException(status_code=404, detail="No hay snapshot en PostgreSQL para exportar")

    max_updated = max((r.get("actualizado_en") for r in rows if r.get("actualizado_en") is not None), default=None)
    if max_updated is None:
        max_updated = datetime.now(timezone.utc)

    records = []
    for row in rows:
        updated_at = row.get("actualizado_en") or max_updated
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        records.append(_build_export_record(row, int(updated_at.timestamp() * 1000)))

    return records, max_updated


def _snapshot_rows_for_export() -> tuple[list[dict], datetime]:
    if _memory_mode:
        return _snapshot_rows_for_export_memory()
    return _snapshot_rows_for_export_postgres()


def _build_export_blob_path(reference_dt: datetime) -> str:
    prefix = _normalize_prefix(RAW_EXPORT_GCS_PREFIX)
    snapshot_date = reference_dt.astimezone(SPAIN_TZ).date().isoformat()
    return f"{prefix}snapshot_date={snapshot_date}/gasolineras.parquet"


def _upload_raw_snapshot_to_gcs(records: list[dict], blob_path: str) -> str:
    pyarrow, parquet, storage = _load_raw_export_deps()

    table = pyarrow.Table.from_pylist(records)
    buf = io.BytesIO()
    parquet.write_table(table, buf, compression=RAW_EXPORT_PARQUET_COMPRESSION)
    buf.seek(0)

    client = storage.Client()
    bucket = client.bucket(RAW_EXPORT_GCS_BUCKET)
    blob = bucket.blob(blob_path)
    blob.upload_from_file(buf, content_type="application/octet-stream")

    return f"gs://{RAW_EXPORT_GCS_BUCKET}/{blob_path}"


def _build_historical_rows(datos_validos: list[dict], fecha_hoy: date, favoritas_ids: Set[str]) -> list[tuple]:
    return [
        (
            g.get("IDEESS"),
            fecha_hoy,
            parse_float(g.get(KEY_P95) or ""),
            parse_float(g.get(KEY_P98) or ""),
            parse_float(g.get(KEY_GASOLEO_A) or ""),
            parse_float(g.get(KEY_GASOLEO_B) or ""),
            parse_float(g.get(KEY_GASOLEO_PREMIUM) or ""),
        )
        for g in datos_validos
        if HISTORICAL_SCOPE != "favoritas" or g.get("IDEESS") in favoritas_ids
    ]


def _persist_historical_rows(historico_rows: list[tuple], fecha_hoy: date) -> int:
    if not historico_rows:
        return 0

    with get_db_conn() as conn:
        with get_cursor(conn) as cur:
            if execute_values is None:
                raise RuntimeError("psycopg2.extras.execute_values no disponible")

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
    logger.info("📊 Guardados %s registros históricos para %s", historico_count, fecha_hoy)
    return historico_count


def _perform_sync(trigger: str = "manual") -> dict:
    logger.info("🔄 Iniciando sincronización de gasolineras (trigger=%s)...", trigger)

    datos = fetch_data_gobierno()
    fecha_sync = datetime.now(timezone.utc)
    datos_validos, rows = _prepare_sync_rows(datos, fecha_sync)

    if _memory_mode:
        historico_count = _sync_to_memory(datos_validos, fecha_sync, update_history=True)
        return _memory_sync_result(
            trigger=trigger,
            fecha_sync=fecha_sync,
            inserted_count=len(_memory_snapshot_rows),
            historico_count=historico_count,
        )

    try:
        deleted_count, inserted_count = _persist_snapshot_to_postgres(rows, fecha_sync)
    except Exception as exc:
        _activate_memory_mode(f"sync-db-write-failed: {exc}")
        _sync_to_memory(datos_validos, fecha_sync, update_history=False)
        return _memory_sync_result(
            trigger=trigger,
            fecha_sync=fecha_sync,
            inserted_count=len(_memory_snapshot_rows),
            historico_count=0,
            warning=str(exc),
        )

    favoritas_ids = _fetch_favoritas_ids()
    fecha_hoy = fecha_sync.date()
    historico_rows = _build_historical_rows(datos_validos, fecha_hoy, favoritas_ids)
    historico_count = _persist_historical_rows(historico_rows, fecha_hoy)

    return {
        "mensaje": "Datos sincronizados correctamente 🚀",
        "registros_eliminados": deleted_count,
        "registros_insertados": inserted_count,
        "registros_historicos": historico_count,
        "historico_scope": HISTORICAL_SCOPE,
        "favoritas_totales": len(favoritas_ids),
        "fecha_snapshot": fecha_sync.date().isoformat(),
        "total": inserted_count,
        "trigger": trigger,
    }


def _maybe_auto_sync_on_read(reason: str):
    global _last_auto_sync_attempt

    if not AUTO_SYNC_ON_READ:
        return

    with _sync_lock:
        now = datetime.now(timezone.utc)
        if _last_auto_sync_attempt is not None:
            elapsed = now - _last_auto_sync_attempt
            if elapsed < timedelta(minutes=AUTO_SYNC_COOLDOWN_MINUTES):
                return

        state = _get_snapshot_state()
        if state["total"] > 0 and state["is_current"]:
            return

        _last_auto_sync_attempt = now
        logger.warning(
            "⚠️ Snapshot no vigente (total=%s, snapshot=%s, hoy=%s). Ejecutando autosync (%s)",
            state["total"],
            state["snapshot_date_local"],
            state["today_local"],
            reason,
        )
        _perform_sync(trigger=f"auto-read:{reason}")


def _validate_viewport(viewport: MarkersViewport) -> None:
    if viewport.lat_sw >= viewport.lat_ne:
        raise HTTPException(status_code=400, detail="lat_sw must be lower than lat_ne")
    if viewport.lon_sw >= viewport.lon_ne:
        raise HTTPException(status_code=400, detail="lon_sw must be lower than lon_ne")


def _bbox_payload(viewport: MarkersViewport) -> dict:
    return {
        "lat_ne": viewport.lat_ne,
        "lon_ne": viewport.lon_ne,
        "lat_sw": viewport.lat_sw,
        "lon_sw": viewport.lon_sw,
    }


def _memory_rows_in_viewport(viewport: MarkersViewport) -> list[dict]:
    return [
        r
        for r in _memory_snapshot_rows
        if r.get("latitud") is not None
        and r.get("longitud") is not None
        and viewport.lat_sw <= float(r["latitud"]) <= viewport.lat_ne
        and viewport.lon_sw <= float(r["longitud"]) <= viewport.lon_ne
    ]


def _memory_cluster_markers(filtered: list[dict], grid_size: float) -> list[dict]:
    grouped: dict[tuple[float, float], dict] = {}
    for row in filtered:
        lat = float(row["latitud"])
        lon = float(row["longitud"])
        key = (round(lat / grid_size) * grid_size, round(lon / grid_size) * grid_size)
        item = grouped.setdefault(key, {"count": 0, "min_price": None})
        item["count"] += 1
        price = row.get("precio_95_e5")
        if price is not None:
            item["min_price"] = price if item["min_price"] is None else min(item["min_price"], price)

    markers = [
        {
            "type": "cluster",
            "latitude": lat,
            "longitude": lon,
            "count": data["count"],
            "min_precio_95_e5": _fmt(data.get("min_price")),
        }
        for (lat, lon), data in grouped.items()
    ]
    markers.sort(key=lambda marker: marker["count"], reverse=True)
    return markers[:1500]


def _memory_station_markers(filtered: list[dict]) -> list[dict]:
    filtered.sort(key=lambda row: (row.get("precio_95_e5") is None, row.get("precio_95_e5"), row.get("ideess")))
    return [{"type": "station", "station": _row_to_api(row)} for row in filtered[:2000]]


def _markers_from_memory(viewport: MarkersViewport, grid_size: Optional[float]) -> tuple[str, list[dict]]:
    _ensure_memory_snapshot_loaded("markers")
    filtered = _memory_rows_in_viewport(viewport)
    if grid_size is not None:
        return "cluster", _memory_cluster_markers(filtered, grid_size)
    return "station", _memory_station_markers(filtered)


def _postgres_cluster_markers(viewport: MarkersViewport, grid_size: float) -> list[dict]:
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
                        MIN(precio_95_e5) AS min_precio_95_e5
                    FROM filtered
                    GROUP BY grid_geom
                )
                SELECT
                    ST_Y(ST_Centroid(grid_geom)) AS latitude,
                    ST_X(ST_Centroid(grid_geom)) AS longitude,
                    total,
                    min_precio_95_e5
                FROM grouped
                ORDER BY total DESC
                LIMIT 1500
                """,
                [
                    viewport.lon_sw,
                    viewport.lat_sw,
                    viewport.lon_ne,
                    viewport.lat_ne,
                    grid_size,
                    grid_size,
                ],
            )
            rows = [dict(row) for row in cur.fetchall()]

    return [
        {
            "type": "cluster",
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
            "count": int(row["total"]),
            "min_precio_95_e5": _fmt(row.get("min_precio_95_e5")),
        }
        for row in rows
    ]


def _postgres_station_markers(viewport: MarkersViewport) -> list[dict]:
    with get_db_conn() as conn:
        with get_cursor(conn) as cur:
            cur.execute(
                """
                SELECT
                    ideess, rotulo, municipio, provincia, direccion,
                    precio_95_e5, precio_98_e5, precio_gasoleo_a,
                    precio_gasoleo_b, precio_gasoleo_premium,
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
                [
                    viewport.lon_sw,
                    viewport.lat_sw,
                    viewport.lon_ne,
                    viewport.lat_ne,
                ],
            )
            rows = [dict(row) for row in cur.fetchall()]
    return [{"type": "station", "station": _row_to_api(row)} for row in rows]


def _markers_from_postgres(viewport: MarkersViewport, grid_size: Optional[float]) -> tuple[str, list[dict]]:
    if grid_size is not None:
        return "cluster", _postgres_cluster_markers(viewport, grid_size)
    return "station", _postgres_station_markers(viewport)


def _markers_response(mode: str, zoom: int, markers: list[dict], viewport: MarkersViewport) -> dict:
    return {
        "mode": mode,
        "zoom": zoom,
        "count": len(markers),
        "markers": markers,
        "bbox": _bbox_payload(viewport),
    }


@router.post(
    "/markers",
    response_model=dict,
    summary="Obtener markers de gasolineras por viewport",
    description="Devuelve clusters a bajo zoom y estaciones individuales a alto zoom, siempre desde BD.",
    responses={400: {"description": "Viewport inválido"}, 500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def get_gasolineras_markers(viewport: MarkersViewport):
    try:
        _maybe_auto_sync_on_read("markers")

        _validate_viewport(viewport)

        grid_size = _grid_size_for_zoom(viewport.zoom)

        if _memory_mode:
            mode, markers = _markers_from_memory(viewport, grid_size)
        else:
            mode, markers = _markers_from_postgres(viewport, grid_size)

        return _markers_response(mode, viewport.zoom, markers, viewport)

    except HTTPException:
        raise
    except Exception as e:
        if not _memory_mode:
            _activate_memory_mode(f"markers-db-failed: {e}")
            return get_gasolineras_markers(viewport)
        logger.error(f"❌ Error al obtener markers de gasolineras: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error al obtener markers: {e}")


# ---------------------------------------------------------------------------
# GET /gasolineras/
# ---------------------------------------------------------------------------
@router.get(
    "/",
    response_model=dict,
    summary="Obtener gasolineras",
    description="Obtiene la lista de gasolineras con soporte para filtros y paginación.",
    responses={500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def get_gasolineras(
    provincia: Annotated[Optional[str], Query(description="Filtrar por provincia")] = None,
    municipio: Annotated[Optional[str], Query(description="Filtrar por municipio")] = None,
    precio_max: Annotated[Optional[float], Query(description="Precio máximo gasolina 95")] = None,
    skip: Annotated[int, Query(ge=0, description="Elementos a saltar")] = 0,
    limit: Annotated[int, Query(ge=1, le=20000, description="Número máximo de resultados")] = 100,
):
    try:
        _maybe_auto_sync_on_read("list")

        if _memory_mode:
            _ensure_memory_snapshot_loaded("list")
            filtered = _memory_filter_rows(provincia=provincia, municipio=municipio, precio_max=precio_max)
            total = len(filtered)
            rows = filtered[skip: skip + limit]
            gasolineras_list = [_row_to_api(r) for r in rows]
            return {
                "total": total,
                "skip": skip,
                "limit": limit,
                "count": len(gasolineras_list),
                "gasolineras": gasolineras_list,
                "storage_mode": "memory-fallback",
            }

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
                total = count_row["total"]
                cur.execute(
                    f"SELECT * FROM gasolineras {where} OFFSET %s LIMIT %s",
                    params + [skip, limit],
                )
                rows = [dict(r) for r in cur.fetchall()]

        gasolineras_list = [_row_to_api(r) for r in rows]
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "count": len(gasolineras_list),
            "gasolineras": gasolineras_list,
            "storage_mode": "postgres",
        }
    except Exception as e:
        if not _memory_mode:
            _activate_memory_mode(f"list-db-failed: {e}")
            return get_gasolineras(provincia=provincia, municipio=municipio, precio_max=precio_max, skip=skip, limit=limit)
        raise HTTPException(status_code=500, detail=f"Error al consultar las gasolineras: {e}")


def _nearby_rows_from_memory(lat: float, lon: float, km: float, limit: int) -> list[dict]:
    _ensure_memory_snapshot_loaded("nearby")
    rows = []
    for row in _memory_snapshot_rows:
        r_lat = row.get("latitud")
        r_lon = row.get("longitud")
        if r_lat is None or r_lon is None:
            continue
        dist = _haversine_km(lat, lon, float(r_lat), float(r_lon))
        if dist <= km:
            nearby_row = dict(row)
            nearby_row["distancia_km"] = dist
            rows.append(nearby_row)
    rows.sort(key=lambda item: item.get("distancia_km") or 0.0)
    return rows[:limit]


def _nearby_rows_from_postgres(lat: float, lon: float, km: float, limit: int) -> list[dict]:
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
    with get_db_conn() as conn:
        with get_cursor(conn) as cur:
            cur.execute(sql, [lon, lat, lon, lat, km * 1000, limit])
            return [dict(row) for row in cur.fetchall()]


def _serialize_nearby_rows(rows: list[dict]) -> list[dict]:
    gasolineras_list = []
    for row in rows:
        item = _row_to_api(row)
        item["distancia_km"] = float(row["distancia_km"]) if row.get("distancia_km") is not None else None
        gasolineras_list.append(item)
    return gasolineras_list


# ---------------------------------------------------------------------------
# GET /gasolineras/cerca
# ---------------------------------------------------------------------------
@router.get(
    "/cerca",
    summary="Obtener gasolineras cercanas a una ubicación",
    responses={500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def gasolineras_cerca(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    km: Annotated[float, Query(gt=0, le=200)] = 50,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
):
    try:
        _maybe_auto_sync_on_read("nearby")

        if _memory_mode:
            rows = _nearby_rows_from_memory(lat, lon, km, limit)
        else:
            rows = _nearby_rows_from_postgres(lat, lon, km, limit)

        gasolineras_list = _serialize_nearby_rows(rows)

        return {
            "ubicacion": {"lat": lat, "lon": lon},
            "radio_km": km,
            "count": len(gasolineras_list),
            "gasolineras": gasolineras_list,
            "storage_mode": "memory-fallback" if _memory_mode else "postgres",
        }
    except Exception as e:
        if not _memory_mode:
            _activate_memory_mode(f"nearby-db-failed: {e}")
            return gasolineras_cerca(lat=lat, lon=lon, km=km, limit=limit)
        raise HTTPException(status_code=500, detail=f"Error al buscar gasolineras cercanas: {e}")


# ---------------------------------------------------------------------------
# POST /gasolineras/sync
# ---------------------------------------------------------------------------
@router.post(
    "/sync",
    response_model=dict,
    summary="Sincronizar gasolineras desde la API del Gobierno de España",
    responses={403: {"description": "Forbidden"}, 500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def sync_gasolineras(x_internal_secret: Annotated[Optional[str], Header(alias="X-Internal-Secret")] = None):
    _validate_internal_secret(x_internal_secret)

    try:
        with _sync_lock:
            return _perform_sync(trigger="manual")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al sincronizar datos: {e}")


# ---------------------------------------------------------------------------
# GET /gasolineras/count
# ---------------------------------------------------------------------------
@router.get("/count", response_model=dict, summary="Contar gasolineras", responses={500: {"description": "Error interno"}})
def count_gasolineras():
    try:
        if _memory_mode:
            _ensure_memory_snapshot_loaded("count")
            total = len(_memory_snapshot_rows)
            return {"total": total, "mensaje": f"Total de gasolineras: {total}", "storage_mode": "memory-fallback"}

        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute("SELECT COUNT(*) AS total FROM gasolineras")
                count_row = cur.fetchone() or {"total": 0}
                total = count_row["total"]
        return {"total": total, "mensaje": f"Total de gasolineras: {total}", "storage_mode": "postgres"}
    except Exception as e:
        if not _memory_mode:
            _activate_memory_mode(f"count-db-failed: {e}")
            return count_gasolineras()
        raise HTTPException(status_code=500, detail=f"Error al contar gasolineras: {e}")


@router.get("/snapshot", response_model=dict, summary="Estado de frescura del snapshot", responses={500: {"description": "Error interno"}})
def snapshot_status():
    try:
        state = _get_snapshot_state()
        return {
            "total": state["total"],
            "is_current": state["is_current"],
            "today_local": state["today_local"].isoformat(),
            "snapshot_date_local": state["snapshot_date_local"].isoformat() if state["snapshot_date_local"] else None,
            "last_sync_at": state["last_sync_at"].isoformat() if state["last_sync_at"] else None,
            "timezone": "Europe/Madrid",
            "storage_mode": "memory-fallback" if _memory_mode else "postgres",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener snapshot: {e}")


@router.post(
    "/ensure-fresh",
    response_model=dict,
    summary="Sincroniza solo si faltan datos actuales",
    responses={403: {"description": "Forbidden"}, 500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def ensure_fresh_gasolineras(x_internal_secret: Annotated[Optional[str], Header(alias="X-Internal-Secret")] = None):
    _validate_internal_secret(x_internal_secret)

    try:
        with _sync_lock:
            state = _get_snapshot_state()
            if state["total"] > 0 and state["is_current"]:
                return {
                    "synced": False,
                    "reason": "snapshot-current",
                    "total": state["total"],
                    "snapshot_date_local": state["snapshot_date_local"].isoformat() if state["snapshot_date_local"] else None,
                    "today_local": state["today_local"].isoformat(),
                    "storage_mode": "memory-fallback" if _memory_mode else "postgres",
                }

            result = _perform_sync(trigger="ensure-fresh")
            return {"synced": True, **result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al asegurar frescura: {e}")


@router.post(
    "/export-raw-parquet",
    response_model=dict,
    summary="Exportar snapshot actual a Parquet en GCS",
    description=(
        "Exporta el snapshot actual de gasolineras a GCS en formato Parquet bajo "
        "raw/snapshot_date=YYYY-MM-DD/gasolineras.parquet. "
        "No ejecuta sync por sí mismo; usar junto a /ensure-fresh en cron."
    ),
    responses={
        403: {"description": "Forbidden"},
        404: {"description": "Snapshot no disponible"},
        500: {"description": "Error interno"},
    },
)
def export_raw_parquet_to_gcs(x_internal_secret: Annotated[Optional[str], Header(alias="X-Internal-Secret")] = None):
    _validate_internal_secret(x_internal_secret)

    if not RAW_EXPORT_ENABLED:
        raise HTTPException(status_code=500, detail="RAW_EXPORT_ENABLED=false. Activa la exportación para usar este endpoint")
    if not RAW_EXPORT_GCS_BUCKET:
        raise HTTPException(status_code=500, detail="RAW_EXPORT_GCS_BUCKET no configurado")

    try:
        records, reference_dt = _snapshot_rows_for_export()
        blob_path = _build_export_blob_path(reference_dt)
        uri = _upload_raw_snapshot_to_gcs(records, blob_path)

        return {
            "ok": True,
            "rows": len(records),
            "snapshot_date": reference_dt.astimezone(SPAIN_TZ).date().isoformat(),
            "gcs_uri": uri,
            "gcs_path": blob_path,
            "compression": RAW_EXPORT_PARQUET_COMPRESSION,
            "storage_mode": "memory-fallback" if _memory_mode else "postgres",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error exportando parquet a GCS: {exc}")


def _stats_filters(provincia: Optional[str], municipio: Optional[str]) -> tuple[str, list]:
    conditions: list[str] = []
    params: list = []
    if provincia:
        conditions.append("provincia ILIKE %s")
        params.append(f"%{provincia}%")
    if municipio:
        conditions.append("municipio ILIKE %s")
        params.append(f"%{municipio}%")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return where, params


def _stats_rows(provincia: Optional[str], municipio: Optional[str]) -> list[dict]:
    if _memory_mode:
        _ensure_memory_snapshot_loaded("stats")
        return _memory_filter_rows(provincia=provincia, municipio=municipio)

    where, params = _stats_filters(provincia, municipio)
    with get_db_conn() as conn:
        with get_cursor(conn) as cur:
            cur.execute(
                f"SELECT precio_95_e5, precio_98_e5, precio_gasoleo_a, "
                f"precio_gasoleo_b, precio_gasoleo_premium FROM gasolineras {where}",
                params,
            )
            return [dict(row) for row in cur.fetchall()]


def _price_stats(rows: list[dict], field: str) -> Optional[dict]:
    precios = sorted(float(row[field]) for row in rows if row.get(field) is not None and float(row[field]) > 0)
    if not precios:
        return None

    total = len(precios)
    return {
        "min": round(precios[0], 3),
        "max": round(precios[-1], 3),
        "media": round(sum(precios) / total, 3),
        "mediana": round(precios[total // 2], 3),
        "p25": round(precios[total // 4], 3),
        "p75": round(precios[total * 3 // 4], 3),
        "total_muestras": total,
    }


def _stats_response(rows: list[dict], provincia: Optional[str], municipio: Optional[str]) -> dict:
    return {
        "total_gasolineras": len(rows),
        "filtros": {"provincia": provincia, "municipio": municipio},
        "combustibles": {
            name: stats
            for name, stats in {
                "gasolina_95": _price_stats(rows, "precio_95_e5"),
                "gasolina_98": _price_stats(rows, "precio_98_e5"),
                "gasoleo_a": _price_stats(rows, "precio_gasoleo_a"),
                "gasoleo_b": _price_stats(rows, "precio_gasoleo_b"),
                "gasoleo_premium": _price_stats(rows, "precio_gasoleo_premium"),
            }.items()
            if stats is not None
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "storage_mode": "memory-fallback" if _memory_mode else "postgres",
    }


# ---------------------------------------------------------------------------
# GET /gasolineras/estadisticas
# ---------------------------------------------------------------------------
@router.get(
    "/estadisticas",
    response_model=dict,
    summary="Obtener estadísticas de precios",
    responses={404: {"description": "Sin datos"}, 500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def obtener_estadisticas(
    provincia: Annotated[Optional[str], Query()] = None,
    municipio: Annotated[Optional[str], Query()] = None,
):
    try:
        _maybe_auto_sync_on_read("stats")

        rows = _stats_rows(provincia, municipio)

        total = len(rows)
        if total == 0:
            raise HTTPException(status_code=404, detail="No se encontraron gasolineras con los filtros especificados")
        return _stats_response(rows, provincia, municipio)
    except HTTPException:
        raise
    except Exception as e:
        if not _memory_mode:
            _activate_memory_mode(f"stats-db-failed: {e}")
            return obtener_estadisticas(provincia=provincia, municipio=municipio)
        raise HTTPException(status_code=500, detail=f"Error al calcular estadísticas: {e}")


def _nearby_by_id_rows_memory(id: str, radio_km: float) -> list[dict]:
    _ensure_memory_snapshot_loaded("nearby-by-id")
    reference = next((row for row in _memory_snapshot_rows if str(row.get("ideess")) == str(id)), None)
    if not reference:
        raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {id}")

    ref_lat = reference.get("latitud")
    ref_lon = reference.get("longitud")
    if ref_lat is None or ref_lon is None:
        return []

    rows = []
    for row in _memory_snapshot_rows:
        if str(row.get("ideess")) == str(id):
            continue
        row_lat = row.get("latitud")
        row_lon = row.get("longitud")
        if row_lat is None or row_lon is None:
            continue
        dist = _haversine_km(float(ref_lat), float(ref_lon), float(row_lat), float(row_lon))
        if dist <= radio_km:
            nearby_row = dict(row)
            nearby_row["distancia_km"] = dist
            rows.append(nearby_row)

    rows.sort(key=lambda item: item["distancia_km"])
    return rows[:10]


def _validate_station_exists(id: str) -> None:
    with get_db_conn() as conn:
        with get_cursor(conn) as cur:
            cur.execute("SELECT 1 FROM gasolineras WHERE ideess = %s", [id])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {id}")


def _nearby_by_id_rows_postgres(id: str, radio_km: float) -> list[dict]:
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
            rows = [dict(row) for row in cur.fetchall()]

    if not rows:
        _validate_station_exists(id)
    return rows


def _nearby_by_id_response(id: str, radio_km: float, rows: list[dict]) -> dict:
    nearby = _serialize_nearby_rows(rows)
    return {
        "origen": id,
        "radio_km": radio_km,
        "cantidad": len(nearby),
        "gasolineras_cercanas": nearby,
    }


# ---------------------------------------------------------------------------
# GET /gasolineras/{id}
# ---------------------------------------------------------------------------
@router.get(
    "/{id}",
    response_model=Gasolinera,
    summary="Obtener detalles de una gasolinera por ID",
    responses={404: {"description": "No encontrado"}, 500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def get_gasolinera_por_id(id: str):
    try:
        _maybe_auto_sync_on_read("detail")

        if _memory_mode:
            _ensure_memory_snapshot_loaded("detail")
            row = next((r for r in _memory_snapshot_rows if str(r.get("ideess")) == str(id)), None)
            if not row:
                raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {id}")
            return _row_to_api(row)

        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute("SELECT * FROM gasolineras WHERE ideess = %s", [id])
                row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {id}")
        return _row_to_api(dict(row))
    except HTTPException:
        raise
    except Exception as e:
        if not _memory_mode:
            _activate_memory_mode(f"detail-db-failed: {e}")
            return get_gasolinera_por_id(id)
        raise HTTPException(status_code=500, detail=f"Error interno al consultar la gasolinera: {e}")


# ---------------------------------------------------------------------------
# GET /gasolineras/{id}/cercanas
# ---------------------------------------------------------------------------
@router.get(
    "/{id}/cercanas",
    summary="Obtener gasolineras cercanas a otra gasolinera",
    responses={404: {"description": "No encontrado"}, 500: {"description": "Error interno"}, 503: {"description": "Fuente no disponible"}},
)
def get_gasolineras_cercanas(id: str, radio_km: float = 5):
    try:
        _maybe_auto_sync_on_read("nearby-by-id")

        if _memory_mode:
            rows = _nearby_by_id_rows_memory(id, radio_km)
        else:
            rows = _nearby_by_id_rows_postgres(id, radio_km)

        return _nearby_by_id_response(id, radio_km, rows)
    except HTTPException:
        raise
    except Exception as e:
        if not _memory_mode:
            _activate_memory_mode(f"nearby-by-id-db-failed: {e}")
            return get_gasolineras_cercanas(id=id, radio_km=radio_km)
        raise HTTPException(status_code=500, detail=f"Error al consultar gasolineras cercanas: {e}")


def _historial_rows_memory(id: str, fecha_desde: date, fecha_hasta: date) -> list[dict]:
    _ensure_memory_snapshot_loaded("historial")
    exists = any(str(row.get("ideess")) == str(id) for row in _memory_snapshot_rows)
    if not exists:
        raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {id}")

    return [
        dict(row)
        for row in _memory_history.get(id, [])
        if fecha_desde <= row.get("fecha", fecha_hasta) <= fecha_hasta
    ]


def _historial_rows_postgres(id: str, fecha_desde: date, fecha_hasta: date) -> list[dict]:
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
            registros = [dict(row) for row in cur.fetchall()]

            if not registros:
                cur.execute("SELECT 1 FROM gasolineras WHERE ideess = %s", [id])
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {id}")

    return registros


def _decorate_historial(registros: list[dict]) -> list[dict]:
    for row in registros:
        if isinstance(row.get("fecha"), date):
            row["fecha"] = row["fecha"].isoformat()
        row["precios"] = {
            "Gasolina 95 E5": _fmt(row.get("p95")),
            "Gasolina 98 E5": _fmt(row.get("p98")),
            "Gasóleo A": _fmt(row.get("pa")),
            "Gasóleo B": _fmt(row.get("pb")),
            "Gasóleo Premium": _fmt(row.get("pp")),
        }
    return registros


# ---------------------------------------------------------------------------
# GET /gasolineras/{id}/historial
# ---------------------------------------------------------------------------
@router.get(
    "/{id}/historial",
    summary="Obtener historial de precios de una gasolinera",
    responses={404: {"description": "No encontrado"}, 500: {"description": "Error interno"}},
)
def get_historial_precios(
    id: str,
    dias: Annotated[int, Query(ge=1, le=365)] = 30,
):
    try:
        fecha_hasta = datetime.now(timezone.utc).date()
        fecha_desde = fecha_hasta - timedelta(days=dias)

        if _memory_mode:
            registros = _historial_rows_memory(id, fecha_desde, fecha_hasta)
        else:
            registros = _historial_rows_postgres(id, fecha_desde, fecha_hasta)

        registros = _decorate_historial(registros)

        return {
            "IDEESS": id,
            "dias_consultados": dias,
            "fecha_desde": fecha_desde.isoformat(),
            "fecha_hasta": fecha_hasta.isoformat(),
            "registros": len(registros),
            "historial": registros,
            "storage_mode": "memory-fallback" if _memory_mode else "postgres",
            **({"mensaje": "No hay datos históricos disponibles para este período"} if not registros else {}),
        }
    except HTTPException:
        raise
    except Exception as e:
        if not _memory_mode:
            _activate_memory_mode(f"historial-db-failed: {e}")
            return get_historial_precios(id=id, dias=dias)
        raise HTTPException(status_code=500, detail=f"Error al consultar historial: {e}")
