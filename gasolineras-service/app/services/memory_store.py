"""Almacen en memoria para fallback cuando PostgreSQL no esta disponible."""
from datetime import datetime, date, timezone
from typing import Optional

from app.clients.gobierno_client import parse_float
from app.services.constants import (
    KEY_DIESEL_RENOVABLE,
    KEY_DIRECCION,
    KEY_GASOLEO_A,
    KEY_GASOLEO_B,
    KEY_GASOLEO_PREMIUM,
    KEY_P95,
    KEY_P95_PREMIUM,
    KEY_P98,
    KEY_ROTULO,
)


class MemoryStore:
    def __init__(self) -> None:
        self.snapshot_rows: list[dict] = []
        self.history: dict[str, list[dict]] = {}
        self.last_sync_at: Optional[datetime] = None

    def has_snapshot(self) -> bool:
        return bool(self.snapshot_rows)

    def to_snapshot_row(self, source: dict, fecha_sync: datetime) -> dict:
        return {
            "ideess": source.get("IDEESS"),
            "rotulo": (source.get(KEY_ROTULO) or "").strip(),
            "municipio": (source.get("Municipio") or "").strip(),
            "provincia": (source.get("Provincia") or "").strip(),
            "direccion": (source.get(KEY_DIRECCION) or "").strip(),
            "precio_95_e5": parse_float(source.get(KEY_P95) or ""),
            "precio_95_e5_premium": parse_float(source.get(KEY_P95_PREMIUM) or ""),
            "precio_98_e5": parse_float(source.get(KEY_P98) or ""),
            "precio_gasoleo_a": parse_float(source.get(KEY_GASOLEO_A) or ""),
            "precio_gasoleo_b": parse_float(source.get(KEY_GASOLEO_B) or ""),
            "precio_gasoleo_premium": parse_float(source.get(KEY_GASOLEO_PREMIUM) or ""),
            "precio_diesel_renovable": parse_float(source.get(KEY_DIESEL_RENOVABLE) or ""),
            "latitud": source.get("Latitud"),
            "longitud": source.get("Longitud"),
            "horario": source.get("Horario"),
            "horario_parsed": source.get("Horario_parsed"),
            "actualizado_en": fecha_sync,
        }

    def replace_snapshot(self, datos_validos: list[dict], fecha_sync: datetime) -> int:
        self.snapshot_rows = [self.to_snapshot_row(item, fecha_sync) for item in datos_validos]
        self.last_sync_at = fecha_sync
        return len(self.snapshot_rows)

    def update_history(self, fecha_sync: datetime, retention_days: int) -> int:
        fecha_hoy = fecha_sync.date()
        historico_count = 0
        for row in self.snapshot_rows:
            ideess = row.get("ideess")
            if not ideess:
                continue
            history = self.history.setdefault(ideess, [])
            history = [h for h in history if h.get("fecha") != fecha_hoy]
            history.append(
                {
                    "ideess": ideess,
                    "fecha": fecha_hoy,
                    "p95": row.get("precio_95_e5"),
                    "p95p": row.get("precio_95_e5_premium"),
                    "p98": row.get("precio_98_e5"),
                    "pa": row.get("precio_gasoleo_a"),
                    "pb": row.get("precio_gasoleo_b"),
                    "pp": row.get("precio_gasoleo_premium"),
                    "pdr": row.get("precio_diesel_renovable"),
                }
            )
            self.history[ideess] = history[-retention_days:]
            historico_count += 1
        return historico_count

    def filter_rows(
        self,
        provincia: Optional[str] = None,
        municipio: Optional[str] = None,
        precio_max: Optional[float] = None,
    ) -> list[dict]:
        rows = self.snapshot_rows
        if provincia:
            p = provincia.lower()
            rows = [r for r in rows if p in (r.get("provincia") or "").lower()]
        if municipio:
            m = municipio.lower()
            rows = [r for r in rows if m in (r.get("municipio") or "").lower()]
        if precio_max is not None:
            rows = [r for r in rows if r.get("precio_95_e5") is not None and float(r["precio_95_e5"]) <= precio_max]
        return rows

    def row_by_id(self, ideess: str) -> Optional[dict]:
        return next((row for row in self.snapshot_rows if str(row.get("ideess")) == str(ideess)), None)

    def history_by_id(self, ideess: str, fecha_desde: date, fecha_hasta: date) -> list[dict]:
        return [
            dict(row)
            for row in self.history.get(ideess, [])
            if fecha_desde <= row.get("fecha", fecha_hasta) <= fecha_hasta
        ]

    def export_rows(self) -> tuple[list[dict], datetime]:
        if not self.snapshot_rows:
            raise LookupError("No hay snapshot en memoria para exportar")
        reference_dt = self.last_sync_at or datetime.now(timezone.utc)
        return self.snapshot_rows, reference_dt
