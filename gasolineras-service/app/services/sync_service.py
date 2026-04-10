"""Servicio de sincronizacion de snapshots (Ministerio -> BD/memoria)."""
import logging
import threading
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException

from app.clients.gobierno_client import GobiernoClient, parse_float
from app.clients.usuarios_client import UsuariosClient
from app.config import Settings
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

logger = logging.getLogger(__name__)


class SyncService:
    def __init__(
        self,
        settings: Settings,
        gas_repo: GasolinerasRepository,
        history_repo: HistoryRepository,
        gobierno_client: GobiernoClient,
        usuarios_client: UsuariosClient,
        memory_store: MemoryStore,
    ) -> None:
        self.settings = settings
        self.gas_repo = gas_repo
        self.history_repo = history_repo
        self.gobierno_client = gobierno_client
        self.usuarios_client = usuarios_client
        self.memory_store = memory_store

        self._memory_mode = settings.force_memory_mode
        self._sync_lock = threading.Lock()
        self._last_auto_sync_attempt: Optional[datetime] = None

    @property
    def sync_lock(self) -> threading.Lock:
        return self._sync_lock

    @property
    def memory_mode(self) -> bool:
        return self._memory_mode

    def activate_memory_mode(self, reason: str) -> None:
        if not self._memory_mode:
            logger.warning("⚠️ Activando modo fallback en memoria: %s", reason)
        self._memory_mode = True

    def ensure_memory_snapshot_loaded(self, reason: str = "read") -> None:
        if self.memory_store.has_snapshot():
            return
        logger.info("ℹ️ Cargando snapshot en memoria (%s)", reason)
        try:
            self.perform_sync(trigger=f"memory-bootstrap:{reason}")
        except Exception as exc:
            logger.warning("⚠️ No se pudo bootstrapear snapshot en memoria (%s): %s", reason, exc)
            self.memory_store.last_sync_at = datetime.now(timezone.utc)

    def get_snapshot_state(self) -> dict:
        today_local = datetime.now(SPAIN_TZ).date()

        if self._memory_mode:
            total = len(self.memory_store.snapshot_rows)
            last_sync_at = self.memory_store.last_sync_at
        else:
            db_state = self.gas_repo.get_snapshot_state()
            total = db_state["total"]
            last_sync_at = db_state["last_sync_at"]

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

    def _prepare_sync_rows(self, datos: list[dict], fecha_sync: datetime) -> tuple[list[dict], list[tuple]]:
        if not datos:
            raise HTTPException(status_code=500, detail="No se pudieron obtener datos desde la API del gobierno")

        datos_validos = [g for g in datos if g.get("Latitud") is not None and g.get("Longitud") is not None]
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
                g.get("Horario_parsed"),
                fecha_sync,
            )
            for g in datos_validos
        ]
        return datos_validos, rows

    def _fetch_favoritas_ids(self) -> set[str]:
        if self.settings.historical_scope != "favoritas":
            return set()
        favoritas_ids = self.usuarios_client.fetch_favoritas_ids(
            internal_secret=self.settings.internal_api_secret,
            use_internal_secret=self.settings.use_internal_api_secret,
        )
        logger.info("📌 %s IDEESS favoritos para histórico", len(favoritas_ids))
        return favoritas_ids

    def _build_historical_rows(self, datos_validos: list[dict], fecha_hoy: date, favoritas_ids: set[str]) -> list[tuple]:
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
            if self.settings.historical_scope != "favoritas" or g.get("IDEESS") in favoritas_ids
        ]

    def _memory_sync_result(
        self,
        trigger: str,
        fecha_sync: datetime,
        inserted_count: int,
        historico_count: int,
        warning: Optional[str] = None,
    ) -> dict:
        body = {
            "registros_eliminados": 0,
            "registros_insertados": inserted_count,
            "registros_historicos_pruned": 0,
            "registros_historicos": historico_count,
            "historico_scope": self.settings.historical_scope,
            "retention_days": self.settings.history_retention_days,
            "favoritas_totales": 0,
            "fecha_snapshot": fecha_sync.date().isoformat(),
            "total": inserted_count,
            "trigger": trigger,
            "storage_mode": "memory-fallback",
            "mensaje": "Datos sincronizados correctamente 🚀",
        }
        if warning:
            body["warning"] = warning
            body["mensaje"] = "Datos sincronizados con fallback en memoria 🚀"
        return body

    def perform_sync(self, trigger: str = "manual") -> dict:
        logger.info("🔄 Iniciando sincronización (trigger=%s)", trigger)

        datos = self.gobierno_client.fetch_gasolineras()
        fecha_sync = datetime.now(timezone.utc)
        datos_validos, rows = self._prepare_sync_rows(datos, fecha_sync)

        if self._memory_mode:
            inserted_count = self.memory_store.replace_snapshot(datos_validos, fecha_sync)
            historico_count = self.memory_store.update_history(fecha_sync, self.settings.history_retention_days)
            return self._memory_sync_result(trigger, fecha_sync, inserted_count, historico_count)

        try:
            deleted_count, inserted_count = self.gas_repo.replace_snapshot(rows)
            retention_cutoff = fecha_sync.date() - timedelta(days=self.settings.history_retention_days)
            pruned_count = self.history_repo.prune_before(retention_cutoff)
        except Exception as exc:
            self.activate_memory_mode(f"sync-db-write-failed: {exc}")
            inserted_count = self.memory_store.replace_snapshot(datos_validos, fecha_sync)
            return self._memory_sync_result(trigger, fecha_sync, inserted_count, 0, warning=str(exc))

        favoritas_ids = self._fetch_favoritas_ids()
        historico_rows = self._build_historical_rows(datos_validos, fecha_sync.date(), favoritas_ids)
        historico_count = self.history_repo.upsert_daily_prices(historico_rows)

        return {
            "mensaje": "Datos sincronizados correctamente 🚀",
            "registros_eliminados": deleted_count,
            "registros_insertados": inserted_count,
            "registros_historicos_pruned": pruned_count,
            "registros_historicos": historico_count,
            "historico_scope": self.settings.historical_scope,
            "retention_days": self.settings.history_retention_days,
            "favoritas_totales": len(favoritas_ids),
            "fecha_snapshot": fecha_sync.date().isoformat(),
            "total": inserted_count,
            "trigger": trigger,
            "storage_mode": "postgres",
        }

    def maybe_auto_sync_on_read(self, reason: str) -> None:
        if not self.settings.auto_sync_on_read:
            return

        with self._sync_lock:
            now = datetime.now(timezone.utc)
            if self._last_auto_sync_attempt is not None:
                elapsed = now - self._last_auto_sync_attempt
                if elapsed < timedelta(minutes=self.settings.auto_sync_cooldown_minutes):
                    return

            state = self.get_snapshot_state()
            if state["total"] > 0 and state["is_current"]:
                return

            self._last_auto_sync_attempt = now
            logger.warning(
                "⚠️ Snapshot no vigente (total=%s, snapshot=%s, hoy=%s). Ejecutando autosync (%s)",
                state["total"],
                state["snapshot_date_local"],
                state["today_local"],
                reason,
            )
            self.perform_sync(trigger=f"auto-read:{reason}")
