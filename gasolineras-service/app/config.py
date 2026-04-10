"""Configuracion central del microservicio de gasolineras."""
import os
from dataclasses import dataclass


def _as_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


@dataclass(frozen=True)
class Settings:
    app_env: str
    port: int
    cors_origins: list[str]

    use_internal_api_secret: bool
    internal_api_secret: str

    usuarios_service_url: str
    gobierno_api_url: str
    api_timeout_seconds: int

    auto_sync_on_read: bool
    auto_sync_cooldown_minutes: int
    auto_ensure_fresh_on_startup: bool

    historical_scope: str
    history_retention_days: int

    raw_export_enabled: bool
    raw_export_gcs_bucket: str
    raw_export_gcs_prefix: str
    raw_export_parquet_compression: str

    force_memory_mode: bool

    @classmethod
    def from_env(cls) -> "Settings":
        cors = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://localhost:80")
        return cls(
            app_env=(os.getenv("APP_ENV") or "development").strip().lower(),
            port=int(os.getenv("PORT", "8080")),
            cors_origins=[item.strip() for item in cors.split(",") if item.strip()],
            use_internal_api_secret=_as_bool(os.getenv("USE_INTERNAL_API_SECRET", "false"), default=False),
            internal_api_secret=(os.getenv("INTERNAL_API_SECRET") or "").strip(),
            usuarios_service_url=(os.getenv("USUARIOS_SERVICE_URL") or "http://usuarios:3001").strip(),
            gobierno_api_url=(
                os.getenv("GOBIERNO_API_URL")
                or "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/"
            ).strip(),
            api_timeout_seconds=int(os.getenv("API_TIMEOUT", "30")),
            auto_sync_on_read=_as_bool(os.getenv("AUTO_SYNC_ON_READ", "false"), default=False),
            auto_sync_cooldown_minutes=max(1, int(os.getenv("AUTO_SYNC_COOLDOWN_MINUTES", "30"))),
            auto_ensure_fresh_on_startup=_as_bool(os.getenv("AUTO_ENSURE_FRESH_ON_STARTUP", "true"), default=True),
            historical_scope=(os.getenv("HISTORICAL_SCOPE", "all") or "all").strip().lower(),
            history_retention_days=max(1, int(os.getenv("HISTORY_RETENTION_DAYS", "30"))),
            raw_export_enabled=_as_bool(os.getenv("RAW_EXPORT_ENABLED", "false"), default=False),
            raw_export_gcs_bucket=(os.getenv("RAW_EXPORT_GCS_BUCKET") or "").strip(),
            raw_export_gcs_prefix=(os.getenv("RAW_EXPORT_GCS_PREFIX") or "raw/").strip() or "raw/",
            raw_export_parquet_compression=(os.getenv("RAW_EXPORT_PARQUET_COMPRESSION") or "snappy").strip() or "snappy",
            force_memory_mode=_as_bool(os.getenv("FORCE_MEMORY_MODE", "false"), default=False),
        )


settings = Settings.from_env()
