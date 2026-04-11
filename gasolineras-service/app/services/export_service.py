"""Servicio de exportacion de snapshot a Parquet en GCS."""
from datetime import datetime, timezone

from fastapi import HTTPException

from app.clients.gcs_client import GCSClient
from app.config import Settings
from app.repositories.gasolineras_repository import GasolinerasRepository
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
    SPAIN_TZ,
)
from app.services.memory_store import MemoryStore
from app.services.sync_service import SyncService


class ExportService:
    def __init__(
        self,
        settings: Settings,
        sync_service: SyncService,
        gas_repo: GasolinerasRepository,
        memory_store: MemoryStore,
        gcs_client: GCSClient,
    ) -> None:
        self.settings = settings
        self.sync_service = sync_service
        self.gas_repo = gas_repo
        self.memory_store = memory_store
        self.gcs_client = gcs_client

    @staticmethod
    def _normalize_prefix(prefix: str) -> str:
        clean = prefix.strip().strip("/")
        return f"{clean}/" if clean else ""

    @staticmethod
    def _format_price(value) -> str:
        if value is None:
            return ""
        try:
            return f"{float(value):.3f}".replace(".", ",")
        except Exception:
            return ""

    def _build_export_record(self, base: dict, fecha_registro_ms: int) -> dict:
        return {
            "IDEESS": str(base.get("ideess") or "").strip(),
            KEY_ROTULO: base.get("rotulo") or "",
            "Municipio": base.get("municipio") or "",
            "Provincia": base.get("provincia") or "",
            KEY_DIRECCION: base.get("direccion") or "",
            KEY_P95: self._format_price(base.get("precio_95_e5")),
            KEY_P95_PREMIUM: self._format_price(base.get("precio_95_e5_premium")),
            KEY_P98: self._format_price(base.get("precio_98_e5")),
            KEY_GASOLEO_A: self._format_price(base.get("precio_gasoleo_a")),
            KEY_GASOLEO_B: self._format_price(base.get("precio_gasoleo_b")),
            KEY_GASOLEO_PREMIUM: self._format_price(base.get("precio_gasoleo_premium")),
            "Precio Gasóleo Premium": self._format_price(base.get("precio_gasoleo_premium")),
            KEY_DIESEL_RENOVABLE: self._format_price(base.get("precio_diesel_renovable")),
            "Latitud": base.get("latitud"),
            "Longitud": base.get("longitud"),
            "Horario": base.get("horario"),
            "Horario_parsed": base.get("horario_parsed"),
            "fecha_registro": fecha_registro_ms,
        }

    def _snapshot_rows_for_export_memory(self) -> tuple[list[dict], datetime]:
        self.sync_service.ensure_memory_snapshot_loaded("export-raw")
        raw_rows, reference_dt = self.memory_store.export_rows()
        fecha_registro_ms = int(reference_dt.timestamp() * 1000)
        return [self._build_export_record(row, fecha_registro_ms) for row in raw_rows], reference_dt

    def _snapshot_rows_for_export_postgres(self) -> tuple[list[dict], datetime]:
        rows = self.gas_repo.snapshot_export_rows()
        if not rows:
            raise LookupError("No hay snapshot en PostgreSQL para exportar")

        updated_candidates = [r.get("actualizado_en") for r in rows if isinstance(r.get("actualizado_en"), datetime)]
        max_updated = max(updated_candidates) if updated_candidates else datetime.now(timezone.utc)

        records = []
        for row in rows:
            updated_at = row.get("actualizado_en") or max_updated
            if updated_at.tzinfo is None:
                updated_at = updated_at.replace(tzinfo=timezone.utc)
            records.append(self._build_export_record(row, int(updated_at.timestamp() * 1000)))

        return records, max_updated

    def _snapshot_rows_for_export(self) -> tuple[list[dict], datetime]:
        if self.sync_service.memory_mode:
            return self._snapshot_rows_for_export_memory()
        return self._snapshot_rows_for_export_postgres()

    def _build_export_blob_path(self, reference_dt: datetime) -> str:
        prefix = self._normalize_prefix(self.settings.raw_export_gcs_prefix)
        snapshot_date = reference_dt.astimezone(SPAIN_TZ).date().isoformat()
        return f"{prefix}snapshot_date={snapshot_date}/gasolineras.parquet"

    def export_snapshot_parquet_result(self) -> dict:
        if not self.settings.raw_export_enabled:
            raise HTTPException(status_code=500, detail="RAW_EXPORT_ENABLED=false. Activa la exportación para usar este endpoint")
        if not self.settings.raw_export_gcs_bucket:
            raise HTTPException(status_code=500, detail="RAW_EXPORT_GCS_BUCKET no configurado")

        try:
            records, reference_dt = self._snapshot_rows_for_export()
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        blob_path = self._build_export_blob_path(reference_dt)
        uri = self.gcs_client.upload_parquet(
            records=records,
            bucket_name=self.settings.raw_export_gcs_bucket,
            blob_path=blob_path,
            compression=self.settings.raw_export_parquet_compression,
        )

        return {
            "ok": True,
            "rows": len(records),
            "snapshot_date": reference_dt.astimezone(SPAIN_TZ).date().isoformat(),
            "gcs_uri": uri,
            "gcs_path": blob_path,
            "compression": self.settings.raw_export_parquet_compression,
            "storage_mode": "memory-fallback" if self.sync_service.memory_mode else "postgres",
        }
