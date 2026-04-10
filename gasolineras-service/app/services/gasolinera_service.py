"""Servicio de consultas y casos de uso de gasolineras."""
import re
from datetime import date, datetime, timedelta, timezone
from math import atan2, cos, isfinite, radians, sin, sqrt
from typing import Optional

from fastapi import HTTPException

from app.decorators.with_memory_fallback import with_memory_fallback
from app.models.viewport import MarkersViewport
from app.repositories.gasolineras_repository import GasolinerasRepository
from app.repositories.history_repository import HistoryRepository
from app.services.constants import (
    KEY_DIRECCION,
    KEY_GASOLEO_A,
    KEY_GASOLEO_B,
    KEY_GASOLEO_PREMIUM,
    KEY_P95,
    KEY_P98,
    KEY_ROTULO,
    SPAIN_TZ,
)
from app.services.memory_store import MemoryStore
from app.services.sync_service import SyncService


class GasolineraService:
    _TEXT_FILTER_RE = re.compile(r"^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñÇç'\-\.\s]+$")

    def __init__(
        self,
        sync_service: SyncService,
        gas_repo: GasolinerasRepository,
        history_repo: HistoryRepository,
        memory_store: MemoryStore,
        history_retention_days: int,
    ) -> None:
        self.sync_service = sync_service
        self.gas_repo = gas_repo
        self.history_repo = history_repo
        self.memory_store = memory_store
        self.history_retention_days = history_retention_days

    def enable_memory_fallback(self, reason: str, exc: Exception) -> bool:
        if self.sync_service.memory_mode:
            return False
        self.sync_service.activate_memory_mode(f"{reason}-db-failed: {exc}")
        return True

    @staticmethod
    def _fmt(val) -> str:
        if val is None:
            return ""
        return f"{float(val):.3f}".replace(".", ",")

    def row_to_api(self, row: dict) -> dict:
        rotulo = row.get("rotulo") or ""
        return {
            "IDEESS": row.get("ideess"),
            "Rotulo": rotulo,
            KEY_ROTULO: rotulo,
            "Municipio": row.get("municipio") or "",
            "Provincia": row.get("provincia") or "",
            KEY_DIRECCION: row.get("direccion") or "",
            KEY_P95: self._fmt(row.get("precio_95_e5")),
            KEY_P98: self._fmt(row.get("precio_98_e5")),
            KEY_GASOLEO_A: self._fmt(row.get("precio_gasoleo_a")),
            KEY_GASOLEO_B: self._fmt(row.get("precio_gasoleo_b")),
            "Precio Gasoleo Premium": self._fmt(row.get("precio_gasoleo_premium")),
            "Latitud": row.get("latitud"),
            "Longitud": row.get("longitud"),
            "Horario": row.get("horario"),
            "horario_parsed": row.get("horario_parsed"),
        }

    @staticmethod
    def _grid_size_for_zoom(zoom: int) -> Optional[float]:
        if zoom <= 5:
            return 0.45
        if zoom <= 6:
            return 0.30
        if zoom <= 7:
            return 0.20
        if zoom <= 8:
            return 0.12
        if zoom <= 9:
            return 0.08
        if zoom <= 10:
            return 0.05
        if zoom <= 11:
            return 0.03
        if zoom <= 12:
            return 0.018
        if zoom <= 13:
            return 0.010
        return None

    @staticmethod
    def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        r = 6371.0
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
        return r * 2 * atan2(sqrt(a), sqrt(1 - a))

    def _validate_text_filter(self, field_name: str, value: Optional[str], max_length: int = 120) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        if len(cleaned) > max_length:
            raise HTTPException(status_code=422, detail=f"Filtro '{field_name}' excede {max_length} caracteres")
        if not self._TEXT_FILTER_RE.fullmatch(cleaned):
            raise HTTPException(status_code=422, detail=f"Filtro '{field_name}' contiene caracteres no permitidos")
        return cleaned

    @staticmethod
    def _validate_geo_query_inputs(lat: float, lon: float, km: float, limit: int) -> None:
        for field_name, value in {"lat": lat, "lon": lon, "km": km}.items():
            if not isfinite(float(value)):
                raise HTTPException(status_code=422, detail=f"{field_name} debe ser un número finito")

        if not (-90 <= lat <= 90):
            raise HTTPException(status_code=422, detail="lat fuera de rango")
        if not (-180 <= lon <= 180):
            raise HTTPException(status_code=422, detail="lon fuera de rango")
        if km <= 0 or km > 200:
            raise HTTPException(status_code=422, detail="km debe estar entre 0 y 200")
        if limit < 1 or limit > 500:
            raise HTTPException(status_code=422, detail="limit debe estar entre 1 y 500")

    @staticmethod
    def _validate_viewport(viewport: MarkersViewport) -> None:
        numeric_with_ranges = [
            ("lat_ne", viewport.lat_ne, -90, 90),
            ("lon_ne", viewport.lon_ne, -180, 180),
            ("lat_sw", viewport.lat_sw, -90, 90),
            ("lon_sw", viewport.lon_sw, -180, 180),
        ]
        for field_name, value, min_value, max_value in numeric_with_ranges:
            if not isfinite(float(value)):
                raise HTTPException(status_code=422, detail=f"{field_name} debe ser un número finito")
            if value < min_value or value > max_value:
                raise HTTPException(status_code=422, detail=f"{field_name} fuera de rango")

        if viewport.lat_sw >= viewport.lat_ne:
            raise HTTPException(status_code=400, detail="lat_sw must be lower than lat_ne")
        if viewport.lon_sw >= viewport.lon_ne:
            raise HTTPException(status_code=400, detail="lon_sw must be lower than lon_ne")

    @staticmethod
    def _bbox_payload(viewport: MarkersViewport) -> dict:
        return {
            "lat_ne": viewport.lat_ne,
            "lon_ne": viewport.lon_ne,
            "lat_sw": viewport.lat_sw,
            "lon_sw": viewport.lon_sw,
        }

    def _memory_rows_in_viewport(self, viewport: MarkersViewport) -> list[dict]:
        return [
            row
            for row in self.memory_store.snapshot_rows
            if row.get("latitud") is not None
            and row.get("longitud") is not None
            and viewport.lat_sw <= float(row["latitud"]) <= viewport.lat_ne
            and viewport.lon_sw <= float(row["longitud"]) <= viewport.lon_ne
        ]

    def _memory_cluster_markers(self, filtered: list[dict], grid_size: float) -> list[dict]:
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
                "min_precio_95_e5": self._fmt(data.get("min_price")),
            }
            for (lat, lon), data in grouped.items()
        ]
        markers.sort(key=lambda marker: marker["count"], reverse=True)
        return markers[:1500]

    def _memory_station_markers(self, filtered: list[dict]) -> list[dict]:
        filtered.sort(key=lambda row: (row.get("precio_95_e5") is None, row.get("precio_95_e5"), row.get("ideess")))
        return [{"type": "station", "station": self.row_to_api(row)} for row in filtered[:2000]]

    def _markers_response(self, mode: str, zoom: int, markers: list[dict], viewport: MarkersViewport) -> dict:
        return {
            "mode": mode,
            "zoom": zoom,
            "count": len(markers),
            "markers": markers,
            "bbox": self._bbox_payload(viewport),
        }

    @with_memory_fallback("markers")
    def get_markers(self, viewport: MarkersViewport) -> dict:
        self.sync_service.maybe_auto_sync_on_read("markers")
        self._validate_viewport(viewport)
        grid_size = self._grid_size_for_zoom(viewport.zoom)

        if self.sync_service.memory_mode:
            self.sync_service.ensure_memory_snapshot_loaded("markers")
            filtered = self._memory_rows_in_viewport(viewport)
            if grid_size is not None:
                return self._markers_response("cluster", viewport.zoom, self._memory_cluster_markers(filtered, grid_size), viewport)
            return self._markers_response("station", viewport.zoom, self._memory_station_markers(filtered), viewport)

        if grid_size is not None:
            rows = self.gas_repo.cluster_markers(
                lon_sw=viewport.lon_sw,
                lat_sw=viewport.lat_sw,
                lon_ne=viewport.lon_ne,
                lat_ne=viewport.lat_ne,
                grid_size=grid_size,
            )
            markers = [
                {
                    "type": "cluster",
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "count": int(row["total"]),
                    "min_precio_95_e5": self._fmt(row.get("min_precio_95_e5")),
                }
                for row in rows
            ]
            return self._markers_response("cluster", viewport.zoom, markers, viewport)

        rows = self.gas_repo.station_markers(
            lon_sw=viewport.lon_sw,
            lat_sw=viewport.lat_sw,
            lon_ne=viewport.lon_ne,
            lat_ne=viewport.lat_ne,
        )
        markers = [{"type": "station", "station": self.row_to_api(row)} for row in rows]
        return self._markers_response("station", viewport.zoom, markers, viewport)

    @with_memory_fallback("list")
    def list_gasolineras(
        self,
        provincia: Optional[str],
        municipio: Optional[str],
        precio_max: Optional[float],
        skip: int,
        limit: int,
    ) -> dict:
        self.sync_service.maybe_auto_sync_on_read("list")

        provincia = self._validate_text_filter("provincia", provincia)
        municipio = self._validate_text_filter("municipio", municipio)
        if precio_max is not None and not isfinite(float(precio_max)):
            raise HTTPException(status_code=422, detail="precio_max debe ser un número finito")

        if self.sync_service.memory_mode:
            self.sync_service.ensure_memory_snapshot_loaded("list")
            filtered = self.memory_store.filter_rows(provincia=provincia, municipio=municipio, precio_max=precio_max)
            total = len(filtered)
            page = filtered[skip: skip + limit]
            return {
                "total": total,
                "skip": skip,
                "limit": limit,
                "count": len(page),
                "gasolineras": [self.row_to_api(row) for row in page],
                "storage_mode": "memory-fallback",
            }

        total, rows = self.gas_repo.list_rows(provincia, municipio, precio_max, skip, limit)
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "count": len(rows),
            "gasolineras": [self.row_to_api(row) for row in rows],
            "storage_mode": "postgres",
        }

    @with_memory_fallback("nearby")
    def nearby(self, lat: float, lon: float, km: float, limit: int) -> dict:
        self.sync_service.maybe_auto_sync_on_read("nearby")
        self._validate_geo_query_inputs(lat, lon, km, limit)

        if self.sync_service.memory_mode:
            self.sync_service.ensure_memory_snapshot_loaded("nearby")
            rows = []
            for row in self.memory_store.snapshot_rows:
                row_lat = row.get("latitud")
                row_lon = row.get("longitud")
                if row_lat is None or row_lon is None:
                    continue
                dist = self._haversine_km(lat, lon, float(row_lat), float(row_lon))
                if dist <= km:
                    copy_row = dict(row)
                    copy_row["distancia_km"] = dist
                    rows.append(copy_row)
            rows.sort(key=lambda item: item["distancia_km"])
            rows = rows[:limit]
            storage_mode = "memory-fallback"
        else:
            rows = self.gas_repo.nearby_rows(lat, lon, km, limit)
            storage_mode = "postgres"

        payload = []
        for row in rows:
            item = self.row_to_api(row)
            item["distancia_km"] = float(row["distancia_km"]) if row.get("distancia_km") is not None else None
            payload.append(item)

        return {
            "ubicacion": {"lat": lat, "lon": lon},
            "radio_km": km,
            "count": len(payload),
            "gasolineras": payload,
            "storage_mode": storage_mode,
        }

    @with_memory_fallback("count")
    def count(self) -> dict:
        if self.sync_service.memory_mode:
            self.sync_service.ensure_memory_snapshot_loaded("count")
            total = len(self.memory_store.snapshot_rows)
            return {"total": total, "mensaje": f"Total de gasolineras: {total}", "storage_mode": "memory-fallback"}

        total = self.gas_repo.count()
        return {"total": total, "mensaje": f"Total de gasolineras: {total}", "storage_mode": "postgres"}

    def snapshot_status(self) -> dict:
        state = self.sync_service.get_snapshot_state()
        return {
            "total": state["total"],
            "is_current": state["is_current"],
            "today_local": state["today_local"].isoformat(),
            "snapshot_date_local": state["snapshot_date_local"].isoformat() if state["snapshot_date_local"] else None,
            "last_sync_at": state["last_sync_at"].isoformat() if state["last_sync_at"] else None,
            "timezone": "Europe/Madrid",
            "storage_mode": "memory-fallback" if self.sync_service.memory_mode else "postgres",
        }

    @with_memory_fallback("stats")
    def stats(self, provincia: Optional[str], municipio: Optional[str]) -> dict:
        self.sync_service.maybe_auto_sync_on_read("stats")

        provincia = self._validate_text_filter("provincia", provincia)
        municipio = self._validate_text_filter("municipio", municipio)

        if self.sync_service.memory_mode:
            self.sync_service.ensure_memory_snapshot_loaded("stats")
            rows = self.memory_store.filter_rows(provincia=provincia, municipio=municipio)
        else:
            rows = self.gas_repo.stats_rows(provincia=provincia, municipio=municipio)

        if not rows:
            raise HTTPException(status_code=404, detail="No se encontraron gasolineras con los filtros especificados")

        def price_stats(field: str) -> Optional[dict]:
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

        fuels = {
            "gasolina_95": price_stats("precio_95_e5"),
            "gasolina_98": price_stats("precio_98_e5"),
            "gasoleo_a": price_stats("precio_gasoleo_a"),
            "gasoleo_b": price_stats("precio_gasoleo_b"),
            "gasoleo_premium": price_stats("precio_gasoleo_premium"),
        }

        return {
            "total_gasolineras": len(rows),
            "filtros": {"provincia": provincia, "municipio": municipio},
            "combustibles": {k: v for k, v in fuels.items() if v is not None},
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "storage_mode": "memory-fallback" if self.sync_service.memory_mode else "postgres",
        }

    @with_memory_fallback("detail")
    def detail(self, ideess: str) -> dict:
        self.sync_service.maybe_auto_sync_on_read("detail")

        if self.sync_service.memory_mode:
            self.sync_service.ensure_memory_snapshot_loaded("detail")
            row = self.memory_store.row_by_id(ideess)
        else:
            row = self.gas_repo.detail_row(ideess)

        if not row:
            raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {ideess}")

        return self.row_to_api(row)

    def _nearby_by_id_rows_memory(self, ideess: str, radio_km: float) -> list[dict]:
        self.sync_service.ensure_memory_snapshot_loaded("nearby-by-id")
        origin = self.memory_store.row_by_id(ideess)
        if not origin:
            raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {ideess}")

        origin_lat = origin.get("latitud")
        origin_lon = origin.get("longitud")
        if origin_lat is None or origin_lon is None:
            return []

        rows = []
        for row in self.memory_store.snapshot_rows:
            if str(row.get("ideess")) == str(ideess):
                continue
            row_lat = row.get("latitud")
            row_lon = row.get("longitud")
            if row_lat is None or row_lon is None:
                continue
            dist = self._haversine_km(float(origin_lat), float(origin_lon), float(row_lat), float(row_lon))
            if dist <= radio_km:
                item = dict(row)
                item["distancia_km"] = dist
                rows.append(item)

        rows.sort(key=lambda item: item["distancia_km"])
        return rows[:10]

    def _serialize_distance_rows(self, rows: list[dict]) -> list[dict]:
        payload = []
        for row in rows:
            item = self.row_to_api(row)
            item["distancia_km"] = float(row["distancia_km"]) if row.get("distancia_km") is not None else None
            payload.append(item)
        return payload

    @with_memory_fallback("nearby-by-id")
    def nearby_by_id(self, ideess: str, radio_km: float) -> dict:
        self.sync_service.maybe_auto_sync_on_read("nearby-by-id")

        if self.sync_service.memory_mode:
            rows = self._nearby_by_id_rows_memory(ideess, radio_km)
        else:
            rows = self.gas_repo.nearby_by_id_rows(ideess, radio_km)
            if not rows and not self.gas_repo.station_exists(ideess):
                raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {ideess}")

        payload = self._serialize_distance_rows(rows)

        return {
            "origen": ideess,
            "radio_km": radio_km,
            "cantidad": len(payload),
            "gasolineras_cercanas": payload,
        }

    @with_memory_fallback("historial")
    def historial(self, ideess: str, dias: int) -> dict:
        fecha_hasta = datetime.now(timezone.utc).date()
        fecha_desde = fecha_hasta - timedelta(days=dias)

        if self.sync_service.memory_mode:
            self.sync_service.ensure_memory_snapshot_loaded("historial")
            if not self.memory_store.row_by_id(ideess):
                raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {ideess}")
            registros = self.memory_store.history_by_id(ideess, fecha_desde, fecha_hasta)
        else:
            registros = self.history_repo.get_history(ideess, fecha_desde, fecha_hasta)
            if not registros and not self.gas_repo.station_exists(ideess):
                raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {ideess}")

        for row in registros:
            if isinstance(row.get("fecha"), date):
                row["fecha"] = row["fecha"].isoformat()
            row["precios"] = {
                "Gasolina 95 E5": self._fmt(row.get("p95")),
                "Gasolina 98 E5": self._fmt(row.get("p98")),
                "Gasóleo A": self._fmt(row.get("pa")),
                "Gasóleo B": self._fmt(row.get("pb")),
                "Gasóleo Premium": self._fmt(row.get("pp")),
            }

        return {
            "IDEESS": ideess,
            "dias_consultados": dias,
            "fecha_desde": fecha_desde.isoformat(),
            "fecha_hasta": fecha_hasta.isoformat(),
            "registros": len(registros),
            "historial": registros,
            "storage_mode": "memory-fallback" if self.sync_service.memory_mode else "postgres",
            **({"mensaje": "No hay datos históricos disponibles para este período"} if not registros else {}),
        }

    def ensure_fresh(self) -> dict:
        with self.sync_service.sync_lock:
            state = self.sync_service.get_snapshot_state()
            if state["total"] > 0 and state["is_current"]:
                return {
                    "synced": False,
                    "reason": "snapshot-current",
                    "total": state["total"],
                    "snapshot_date_local": state["snapshot_date_local"].isoformat() if state["snapshot_date_local"] else None,
                    "today_local": state["today_local"].isoformat(),
                    "storage_mode": "memory-fallback" if self.sync_service.memory_mode else "postgres",
                }
            result = self.sync_service.perform_sync(trigger="ensure-fresh")
            return {"synced": True, **result}

    def daily_sync_export(self, export_callable, force_sync: bool) -> dict:
        with self.sync_service.sync_lock:
            state = self.sync_service.get_snapshot_state()
            should_sync = force_sync or state["total"] <= 0 or not state["is_current"]

            if should_sync:
                sync_result = self.sync_service.perform_sync(trigger="daily-sync-export")
                synced = True
            else:
                sync_result = {
                    "synced": False,
                    "reason": "snapshot-current",
                    "total": state["total"],
                    "snapshot_date_local": state["snapshot_date_local"].isoformat() if state["snapshot_date_local"] else None,
                    "today_local": state["today_local"].isoformat(),
                    "storage_mode": "memory-fallback" if self.sync_service.memory_mode else "postgres",
                }
                synced = False

            try:
                export_result = export_callable()
                return {
                    "status": "success",
                    "database_sync": True,
                    "gcs_export": True,
                    "synced": synced,
                    "sync": sync_result,
                    "export": export_result,
                    "trigger": "daily-sync-export",
                }
            except HTTPException as export_exc:
                return {
                    "status": "partial_success",
                    "database_sync": True,
                    "gcs_export": False,
                    "warning": "GCS export failed, retries needed",
                    "synced": synced,
                    "sync": sync_result,
                    "export_error": export_exc.detail,
                    "trigger": "daily-sync-export",
                }
            except Exception as export_exc:
                return {
                    "status": "partial_success",
                    "database_sync": True,
                    "gcs_export": False,
                    "warning": "GCS export failed, retries needed",
                    "synced": synced,
                    "sync": sync_result,
                    "export_error": str(export_exc),
                    "trigger": "daily-sync-export",
                }
