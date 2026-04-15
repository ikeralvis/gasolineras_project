"""
prediction-service
──────────────────
Modo batch (default):
  - Carga datos parquet (GCS o local)
  - Selecciona estaciones objetivo (env o favoritas)
  - Entrena LightGBM quantile por estación/combustible
  - Persiste predicciones en Neon (tabla prediction_forecasts)
  - Backup opcional a GCS (desactivado por defecto)

Modo API (RUN_HTTP_API=true):
  - Expone GET /api/prediction/station/{ideess}
  - Sirve predicciones desde prediction_forecasts
"""

import glob
import io
import json
import os
import pickle
import tempfile
import urllib.parse
import urllib.request
import warnings
from datetime import date, datetime
from pathlib import Path
from typing import Annotated, Optional
from datetime import timezone

import lightgbm as lgb
import numpy as np
import pandas as pd
import psycopg2
import uvicorn
import yfinance as yf
from fastapi import FastAPI, HTTPException, Query, Request
from google.cloud import storage as gcs
from psycopg2.extras import execute_values

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────

RUN_HTTP_API = os.environ.get("RUN_HTTP_API", "false").lower() == "true"
API_HOST = os.environ.get("API_HOST", "0.0.0.0")
API_PORT = int(os.environ.get("API_PORT", "8001"))

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
PREDICTION_TABLE = os.environ.get("PREDICTION_TABLE", "prediction_forecasts")

# Input dataset
GCS_BUCKET = os.environ.get("GCS_BUCKET", "").strip()
GCS_RAW_PREFIX = os.environ.get("GCS_RAW_PREFIX", "raw/")
LOCAL_RAW_GLOB = os.environ.get("LOCAL_RAW_GLOB", "./raw/*.parquet")

# Model artifacts
GCS_MODEL_PREFIX = os.environ.get("GCS_MODEL_PREFIX", "modelos_lgbm/")
LOCAL_MODEL_DIR = os.environ.get("LOCAL_MODEL_DIR", "/tmp/modelos_lgbm")

# Optional output backups to GCS
ENABLE_GCS_BACKUP = os.environ.get("ENABLE_GCS_BACKUP", "false").lower() == "true"
GCS_OUTPUT_PREFIX = os.environ.get("GCS_OUTPUT_PREFIX", "predicciones/")

# Station target selection
SOURCE_MODE = os.environ.get("SOURCE_MODE", "env").lower()  # env | favorites
FAVORITES_SOURCE = os.environ.get("FAVORITES_SOURCE", "usuarios-service").lower()  # usuarios-service | sql
TOP_N_STATIONS = int(os.environ.get("TOP_N_STATIONS", "500"))
MIN_FAVORITES_COUNT = int(os.environ.get("MIN_FAVORITES_COUNT", "1"))
STATION_IDS = [s.strip() for s in os.environ.get("STATION_IDS", "15158,152,10889").split(",") if s.strip()]
USUARIOS_SERVICE_URL = os.environ.get("USUARIOS_SERVICE_URL", "http://usuarios:3001")
INTERNAL_API_SECRET = os.environ.get("INTERNAL_API_SECRET", "dev-internal-secret-change-in-production")

# Forecast/train config
FUELS = [f.strip() for f in os.environ.get("FUELS", "Precio Gasolina 95 E5|Precio Gasoleo A").split("|") if f.strip()]
BRENT_START = os.environ.get("BRENT_START_DATE", "2022-01-01")
FORCE_RETRAIN = os.environ.get("FORCE_RETRAIN", "false").lower() == "true"
QUANTILE_LOW = float(os.environ.get("QUANTILE_LOW", "0.05"))
QUANTILE_HIGH = float(os.environ.get("QUANTILE_HIGH", "0.95"))
MIN_HISTORY = int(os.environ.get("MIN_HISTORY_DAYS", "60"))

TMP_DIR = Path(tempfile.mkdtemp())
TMP_RAW = TMP_DIR / "raw"
TMP_RAW.mkdir(parents=True, exist_ok=True)

_gcs_client = None


# ─────────────────────────────────────────────────────────────────
# DB HELPERS
# ─────────────────────────────────────────────────────────────────

def _db_conn_string() -> str:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL no configurado")
    if "sslmode=" in DATABASE_URL:
        return DATABASE_URL
    separator = "&" if "?" in DATABASE_URL else "?"
    return f"{DATABASE_URL}{separator}sslmode=require"


def get_db_conn():
    return psycopg2.connect(_db_conn_string())


def ensure_prediction_table():
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {PREDICTION_TABLE} (
                    ideess VARCHAR(10) NOT NULL,
                    fuel VARCHAR(64) NOT NULL,
                    forecast_date DATE NOT NULL,
                    run_date DATE NOT NULL,
                    precio_predicho NUMERIC(8,3) NOT NULL,
                    margen_min NUMERIC(8,3),
                    margen_max NUMERIC(8,3),
                    favorites_count INTEGER,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (ideess, fuel, forecast_date, run_date)
                );
                """
            )
            cur.execute(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{PREDICTION_TABLE}_ideess_run
                    ON {PREDICTION_TABLE} (ideess, run_date DESC);
                """
            )
            cur.execute(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{PREDICTION_TABLE}_run
                    ON {PREDICTION_TABLE} (run_date DESC);
                """
            )


def persist_predictions_to_db(pred_df: pd.DataFrame):
    if pred_df.empty:
        print("ℹ️ Sin predicciones para persistir en DB")
        return

    if not DATABASE_URL:
        print("⚠️ DATABASE_URL no configurado: se omite persistencia en prediction_forecasts")
        return

    ensure_prediction_table()

    rows = []
    for _, row in pred_df.iterrows():
        forecast_day = pd.to_datetime(row["fecha"]).date()
        run_day = pd.to_datetime(row["run_date"]).date()
        favorites_count = row.get("favorites_count")
        if pd.isna(favorites_count):
            favorites_count = None
        else:
            favorites_count = int(favorites_count)
        rows.append(
            (
                str(row["IDEESS"]),
                str(row["fuel"]),
                forecast_day,
                run_day,
                float(row["precio_predicho"]),
                float(row["margen_min"]),
                float(row["margen_max"]),
                favorites_count,
            )
        )

    with get_db_conn() as conn:
        with conn.cursor() as cur:
            execute_values(
                cur,
                f"""
                INSERT INTO {PREDICTION_TABLE}
                    (ideess, fuel, forecast_date, run_date, precio_predicho, margen_min, margen_max, favorites_count)
                VALUES %s
                ON CONFLICT (ideess, fuel, forecast_date, run_date)
                DO UPDATE SET
                    precio_predicho = EXCLUDED.precio_predicho,
                    margen_min = EXCLUDED.margen_min,
                    margen_max = EXCLUDED.margen_max,
                    favorites_count = EXCLUDED.favorites_count,
                    updated_at = NOW();
                """,
                rows,
            )
    print(f"✅ Persistidas {len(rows)} filas en {PREDICTION_TABLE}")


# ─────────────────────────────────────────────────────────────────
# TARGET STATIONS (SOURCE MODE)
# ─────────────────────────────────────────────────────────────────

def _normalize_station_targets(items) -> list[tuple[str, Optional[int]]]:
    seen = set()
    result = []
    for ideess, favorites_count in items:
        sid = str(ideess).strip()
        if not sid or sid in seen:
            continue
        seen.add(sid)
        result.append((sid, favorites_count))
    return result


def _fetch_favorites_from_sql() -> list[tuple[str, Optional[int]]]:
    with get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ideess, COUNT(*)::int AS favorites_count
                FROM user_favorites
                GROUP BY ideess
                HAVING COUNT(*) >= %s
                ORDER BY favorites_count DESC, ideess ASC
                LIMIT %s;
                """,
                [max(MIN_FAVORITES_COUNT, 1), max(TOP_N_STATIONS, 1)],
            )
            rows = cur.fetchall()

    return _normalize_station_targets([(r[0], int(r[1])) for r in rows])


def _http_get_json(url: str, headers: Optional[dict] = None, timeout: int = 10) -> dict:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = resp.read().decode("utf-8")
        return json.loads(payload)


def _fetch_favorites_from_service() -> list[tuple[str, Optional[int]]]:
    headers = {"X-Internal-Secret": INTERNAL_API_SECRET}

    # Endpoint con stats (preferido para aplicar top_n y min_favorites en origen)
    stats_qs = urllib.parse.urlencode(
        {
            "top_n": max(TOP_N_STATIONS, 1),
            "min_favorites": max(MIN_FAVORITES_COUNT, 1),
        }
    )
    stats_url = f"{USUARIOS_SERVICE_URL}/api/usuarios/favoritos/stats?{stats_qs}"

    try:
        data = _http_get_json(stats_url, headers=headers)
        stations = data.get("stations", [])
        targets = [(s.get("ideess"), int(s.get("favorites_count", 0))) for s in stations if s.get("ideess")]
        targets = _normalize_station_targets(targets)
        if targets:
            return targets
    except Exception as e:
        print(f"⚠️ No se pudo leer /favoritos/stats: {e}")

    # Fallback legacy: endpoint con IDEESS únicos (sin conteo)
    fallback_url = f"{USUARIOS_SERVICE_URL}/api/usuarios/favoritos/all-ideess"
    data = _http_get_json(fallback_url, headers=headers)
    ideess = data.get("ideess", [])
    targets = _normalize_station_targets([(sid, 1) for sid in ideess])

    if MIN_FAVORITES_COUNT > 1:
        # Sin conteo real en fallback, no se puede garantizar umbral >1
        print("⚠️ Fallback sin conteos: min_favorites>1 podría dejar fuera estaciones válidas")
        return []

    return targets[: max(TOP_N_STATIONS, 1)]


def resolve_station_targets() -> list[tuple[str, Optional[int]]]:
    if SOURCE_MODE != "favorites":
        return _normalize_station_targets([(sid, None) for sid in STATION_IDS])

    print(
        f"🎯 source_mode=favorites | source={FAVORITES_SOURCE} | "
        f"top_n={TOP_N_STATIONS} | min_favorites={MIN_FAVORITES_COUNT}"
    )

    try:
        if FAVORITES_SOURCE == "sql":
            targets = _fetch_favorites_from_sql()
        else:
            targets = _fetch_favorites_from_service()
    except Exception as e:
        print(f"⚠️ Error resolviendo favoritas ({FAVORITES_SOURCE}): {e}")
        targets = []

    if not targets:
        print("⚠️ No se obtuvieron estaciones por favoritas; fallback a STATION_IDS")
        targets = _normalize_station_targets([(sid, None) for sid in STATION_IDS])

    return targets


# ─────────────────────────────────────────────────────────────────
# GCS / LOCAL I/O
# ─────────────────────────────────────────────────────────────────

def get_gcs():
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = gcs.Client()
    return _gcs_client


def download_raw_parquets_from_gcs() -> list[str]:
    if not GCS_BUCKET:
        return []

    client = get_gcs()
    bucket = client.bucket(GCS_BUCKET)
    blobs = list(bucket.list_blobs(prefix=GCS_RAW_PREFIX))
    parquet_blobs = [b for b in blobs if b.name.endswith(".parquet")]

    print(f"📥 Descargando {len(parquet_blobs)} parquets desde gs://{GCS_BUCKET}/{GCS_RAW_PREFIX}")

    local_paths = []
    for blob in parquet_blobs:
        filename = Path(blob.name).name
        local_path = TMP_RAW / filename
        blob.download_to_filename(str(local_path))
        local_paths.append(str(local_path))

    return local_paths


def resolve_raw_files() -> list[str]:
    files = []

    if GCS_BUCKET:
        files.extend(download_raw_parquets_from_gcs())

    if not files:
        files = glob.glob(LOCAL_RAW_GLOB)

    files = sorted(set(files))
    print(f"📂 Archivos raw detectados: {len(files)}")
    return files


def upload_bytes_to_gcs(data: bytes, gcs_path: str):
    if not GCS_BUCKET:
        return
    client = get_gcs()
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(gcs_path)
    blob.upload_from_string(data)


def download_bytes_from_gcs(gcs_path: str):
    if not GCS_BUCKET:
        return None
    client = get_gcs()
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(gcs_path)
    if not blob.exists():
        return None
    return blob.download_as_bytes()


# ─────────────────────────────────────────────────────────────────
# MODELOS
# ─────────────────────────────────────────────────────────────────

def _model_key(station: str, fuel: str) -> str:
    fuel_clean = fuel.replace(" ", "_").replace("/", "-")
    return f"{station}_{fuel_clean}.pkl"


def save_model(models, feature_cols, station, fuel):
    payload = pickle.dumps({"models": models, "feature_cols": feature_cols})
    key = _model_key(station, fuel)

    if GCS_BUCKET:
        upload_bytes_to_gcs(payload, f"{GCS_MODEL_PREFIX}{key}")
        return

    os.makedirs(LOCAL_MODEL_DIR, exist_ok=True)
    with open(os.path.join(LOCAL_MODEL_DIR, key), "wb") as f:
        f.write(payload)


def load_model(station, fuel):
    key = _model_key(station, fuel)
    raw = None

    if GCS_BUCKET:
        raw = download_bytes_from_gcs(f"{GCS_MODEL_PREFIX}{key}")
    else:
        local_path = os.path.join(LOCAL_MODEL_DIR, key)
        if os.path.exists(local_path):
            with open(local_path, "rb") as f:
                raw = f.read()

    if raw is None:
        return None, None

    data = pickle.loads(raw)
    return data["models"], data["feature_cols"]


# ─────────────────────────────────────────────────────────────────
# DATOS + FEATURES + TRAIN
# ─────────────────────────────────────────────────────────────────

def load_raw_data(file_paths: list[str]) -> pd.DataFrame:
    if not file_paths:
        raise RuntimeError(
            "No hay parquet de entrada. Configura GCS_BUCKET/GCS_RAW_PREFIX o LOCAL_RAW_GLOB con archivos válidos."
        )

    dfs = []
    for path in file_paths:
        try:
            d = pd.read_parquet(path)
            if "IDEESS" in d.columns:
                dfs.append(d)
        except Exception as e:
            print(f"⚠️ Error leyendo {path}: {e}")

    if not dfs:
        raise RuntimeError("No se pudieron cargar datos válidos de entrada")

    df = pd.concat(dfs, ignore_index=True)

    def parse_price(col: str):
        return (
            df[col]
            .astype(str)
            .replace("", np.nan)
            .str.replace(",", ".", regex=False)
            .astype(float)
        )

    for c in ["Precio Gasolina 95 E5", "Precio Gasoleo A"]:
        if c in df.columns:
            df[c] = parse_price(c)

    df["fecha"] = pd.to_datetime(df["fecha_registro"], unit="ms").dt.normalize()
    df["IDEESS"] = df["IDEESS"].astype(str).str.strip()

    print(f"✅ Dataset cargado: {df.shape}")
    return df


def load_brent() -> Optional[pd.DataFrame]:
    print(f"📈 Descargando Brent desde {BRENT_START}...")
    try:
        raw = yf.download("BZ=F", start=BRENT_START, progress=False, auto_adjust=True)
        if raw.empty:
            print("⚠️ Brent vacío; se continúa sin Brent")
            return None

        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)

        brent_df = (
            raw[["Close"]]
            .reset_index()
            .rename(columns={"Date": "fecha", "Close": "brent"})
        )
        brent_df["fecha"] = pd.to_datetime(brent_df["fecha"]).dt.normalize()

        all_days = pd.date_range(brent_df["fecha"].min(), brent_df["fecha"].max(), freq="D")
        brent_df = brent_df.set_index("fecha").reindex(all_days).rename_axis("fecha").reset_index()
        brent_df["brent"] = brent_df["brent"].ffill()

        return brent_df
    except Exception as e:
        print(f"⚠️ Error descargando Brent: {e}")
        return None


def build_ts(df, station, fuel):
    d = df[df["IDEESS"] == station].copy()
    if d.empty or fuel not in d.columns:
        return pd.DataFrame(columns=["fecha", "y"])

    ts = d.groupby("fecha")[fuel].mean().sort_index()
    if ts.empty:
        return pd.DataFrame(columns=["fecha", "y"])

    all_days = pd.date_range(ts.index.min(), ts.index.max(), freq="D")
    ts = ts.reindex(all_days).ffill().bfill()
    return ts.reset_index().rename(columns={"index": "fecha", fuel: "y"})


def add_features(ts, brent_df=None):
    df_feat = ts.copy().sort_values("fecha").reset_index(drop=True)

    df_feat["dia_semana"] = df_feat["fecha"].dt.dayofweek
    df_feat["es_fin_de_semana"] = (df_feat["dia_semana"] >= 5).astype(int)
    df_feat["semana_anio"] = df_feat["fecha"].dt.isocalendar().week.astype(int)
    df_feat["mes"] = df_feat["fecha"].dt.month
    df_feat["trimestre"] = df_feat["fecha"].dt.quarter
    df_feat["dia_mes"] = df_feat["fecha"].dt.day

    for lag in [1, 7, 14, 21, 30]:
        df_feat[f"lag_{lag}"] = df_feat["y"].shift(lag)

    for w in [7, 14, 30]:
        df_feat[f"roll_mean_{w}"] = df_feat["y"].shift(1).rolling(w).mean()
    df_feat["roll_std_7"] = df_feat["y"].shift(1).rolling(7).std()

    df_feat["diff_1d"] = df_feat["y"].diff(1)
    df_feat["diff_7d"] = df_feat["y"].diff(7)

    if brent_df is not None:
        df_feat = df_feat.merge(brent_df[["fecha", "brent"]], on="fecha", how="left")
        df_feat["brent"] = df_feat["brent"].ffill()
        df_feat["lag_brent_1"] = df_feat["brent"].shift(1)
        df_feat["lag_brent_7"] = df_feat["brent"].shift(7)
        df_feat["diff_brent_7"] = df_feat["brent"].diff(7)

    return df_feat


BASE_FEATURES = [
    "dia_semana",
    "es_fin_de_semana",
    "semana_anio",
    "mes",
    "trimestre",
    "dia_mes",
    "lag_1",
    "lag_7",
    "lag_14",
    "lag_21",
    "lag_30",
    "roll_mean_7",
    "roll_mean_14",
    "roll_mean_30",
    "roll_std_7",
    "diff_1d",
    "diff_7d",
]
BRENT_FEATURES = ["brent", "lag_brent_1", "lag_brent_7", "diff_brent_7"]


def get_feature_cols(brent_df):
    return BASE_FEATURES + (BRENT_FEATURES if brent_df is not None else [])


LGBM_BASE = {
    "boosting_type": "gbdt",
    "n_estimators": 400,
    "learning_rate": 0.04,
    "num_leaves": 31,
    "min_child_samples": 10,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "verbose": -1,
    "n_jobs": -1,
}


def train_lgbm(ts, brent_df=None):
    df_feat = add_features(ts, brent_df).dropna()
    feature_cols = [c for c in get_feature_cols(brent_df) if c in df_feat.columns]
    X, y = df_feat[feature_cols], df_feat["y"]

    models = {}
    for quantile, label in [
        (QUANTILE_LOW, "low"),
        (0.50, "mid"),
        (QUANTILE_HIGH, "high"),
    ]:
        model = lgb.LGBMRegressor(**{**LGBM_BASE, "objective": "quantile", "alpha": quantile})
        model.fit(X, y)
        models[label] = model

    return models, df_feat, feature_cols


def forecast_7d(models, ts, df_feat, feature_cols, brent_df=None):
    last_date = ts["fecha"].max()
    all_y = list(df_feat["y"].values)
    all_brent = list(df_feat["brent"].values) if "brent" in df_feat.columns else []

    preds = {"fecha": [], "precio_predicho": [], "margen_min": [], "margen_max": []}

    for i in range(7):
        next_date = last_date + pd.Timedelta(days=i + 1)

        def lag(n):
            idx = len(all_y) - n
            return all_y[idx] if idx >= 0 else np.nan

        row = {
            "dia_semana": next_date.dayofweek,
            "es_fin_de_semana": int(next_date.dayofweek >= 5),
            "semana_anio": int(next_date.isocalendar()[1]),
            "mes": next_date.month,
            "trimestre": next_date.quarter,
            "dia_mes": next_date.day,
            "lag_1": lag(1),
            "lag_7": lag(7),
            "lag_14": lag(14),
            "lag_21": lag(21),
            "lag_30": lag(30),
            "roll_mean_7": np.mean(all_y[-7:]) if len(all_y) >= 7 else np.nan,
            "roll_mean_14": np.mean(all_y[-14:]) if len(all_y) >= 14 else np.nan,
            "roll_mean_30": np.mean(all_y[-30:]) if len(all_y) >= 30 else np.nan,
            "roll_std_7": np.std(all_y[-7:]) if len(all_y) >= 7 else np.nan,
            "diff_1d": all_y[-1] - all_y[-2] if len(all_y) >= 2 else 0,
            "diff_7d": all_y[-1] - all_y[-8] if len(all_y) >= 8 else 0,
        }

        if brent_df is not None and len(all_brent) > 0:
            future_brent = brent_df[brent_df["fecha"] <= next_date]
            row["brent"] = future_brent["brent"].iloc[-1] if len(future_brent) > 0 else all_brent[-1]
            row["lag_brent_1"] = all_brent[-1] if len(all_brent) >= 1 else np.nan
            row["lag_brent_7"] = all_brent[-7] if len(all_brent) >= 7 else np.nan
            row["diff_brent_7"] = (all_brent[-1] - all_brent[-7]) if len(all_brent) >= 7 else 0
            all_brent.append(row["brent"])

        x_pred = pd.DataFrame([row])[[c for c in feature_cols if c in row]]

        p_mid = models["mid"].predict(x_pred)[0]
        p_low = min(models["low"].predict(x_pred)[0], p_mid)
        p_high = max(models["high"].predict(x_pred)[0], p_mid)

        preds["fecha"].append(next_date)
        preds["precio_predicho"].append(round(p_mid, 3))
        preds["margen_min"].append(round(p_low, 3))
        preds["margen_max"].append(round(p_high, 3))

        all_y.append(p_mid)

    return pd.DataFrame(preds)


# ─────────────────────────────────────────────────────────────────
# BATCH PIPELINE
# ─────────────────────────────────────────────────────────────────

def save_predictions_backup(pred_df: pd.DataFrame, run_date: str):
    if not ENABLE_GCS_BACKUP:
        print("ℹ️ Backup GCS desactivado (ENABLE_GCS_BACKUP=false)")
        return

    if not GCS_BUCKET:
        print("⚠️ Backup GCS habilitado pero GCS_BUCKET no está configurado")
        return

    for fmt in ["csv", "parquet"]:
        filename = f"predicciones_{run_date}.{fmt}"
        buf = io.BytesIO()
        if fmt == "csv":
            pred_df.to_csv(buf, index=False, decimal=",", sep=";")
        else:
            pred_df.to_parquet(buf, index=False)
        upload_bytes_to_gcs(buf.getvalue(), f"{GCS_OUTPUT_PREFIX}{filename}")
        print(f"💾 Backup en gs://{GCS_BUCKET}/{GCS_OUTPUT_PREFIX}{filename}")


def run_batch():
    print(f"🚀 Batch iniciado: {datetime.now().isoformat()}")
    print(f"   SOURCE_MODE={SOURCE_MODE} | FAVORITES_SOURCE={FAVORITES_SOURCE}")

    raw_paths = resolve_raw_files()
    df = load_raw_data(raw_paths)
    brent_df = load_brent()

    station_targets = resolve_station_targets()
    print(f"🎯 Estaciones objetivo: {len(station_targets)}")

    run_date = datetime.today().strftime("%Y-%m-%d")
    all_preds = []

    for station_id, favorites_count in station_targets:
        print(f"\n📍 Estación: {station_id} (favorites_count={favorites_count})")
        for fuel in FUELS:
            ts = build_ts(df, station_id, fuel)
            if len(ts) < MIN_HISTORY:
                print(f"  ⛽ {fuel}: skip por histórico insuficiente ({len(ts)} días)")
                continue

            models, feature_cols = None, None
            if not FORCE_RETRAIN:
                models, feature_cols = load_model(station_id, fuel)

            # Reentreno full para incorporar el histórico más reciente.
            models, df_feat, feature_cols = train_lgbm(ts, brent_df)
            save_model(models, feature_cols, station_id, fuel)

            fc = forecast_7d(models, ts, df_feat, feature_cols, brent_df)
            fc["IDEESS"] = station_id
            fc["fuel"] = fuel
            fc["run_date"] = run_date
            fc["favorites_count"] = favorites_count
            all_preds.append(fc)
            print(f"  ⛽ {fuel}: predicción OK")

    if not all_preds:
        print("⚠️ No se generaron predicciones (revisa estaciones y mínimo de histórico)")
        return

    pred_df = pd.concat(all_preds, ignore_index=True)

    persist_predictions_to_db(pred_df)
    save_predictions_backup(pred_df, run_date)

    print(f"✅ Batch finalizado: {datetime.now().isoformat()} | filas={len(pred_df)}")


# ─────────────────────────────────────────────────────────────────
# API MODE (SERVING)
# ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Prediction Service",
    version="2.0.0",
    description=(
        "Servicio de predicción de precios de combustible con LightGBM quantile. "
        "Opera en modo batch (Cloud Run Job / Cloud Scheduler) o API (Cloud Run Service). "
        "Las predicciones se generan para las estaciones con más favoritos de todos los usuarios."
    ),
)


@app.get("/")
def root():
    return {
        "service": "prediction-service",
        "mode": "api" if RUN_HTTP_API else "batch",
        "endpoint": "/api/prediction/station/{ideess}",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "mode": "api" if RUN_HTTP_API else "batch",
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get(
    "/api/prediction/station/{ideess}",
    responses={
        404: {"description": "No se encontraron predicciones"},
        500: {"description": "Error interno consultando predicciones"},
    },
)
def get_station_prediction(
    ideess: str,
    fuel: Annotated[Optional[str], Query(description="Filtra por combustible")] = None,
    run_date: Annotated[
        Optional[str],
        Query(description="YYYY-MM-DD. Si no se indica, usa la última ejecución"),
    ] = None,
):
    if not DATABASE_URL:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")

    ensure_prediction_table()

    query_fuel = ""
    params_latest = [ideess]
    params_rows = [ideess]

    if fuel:
        query_fuel = " AND fuel = %s"
        params_latest.append(fuel)
        params_rows.append(fuel)

    selected_run_date = run_date

    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                if not selected_run_date:
                    cur.execute(
                        f"SELECT MAX(run_date) FROM {PREDICTION_TABLE} WHERE ideess = %s{query_fuel}",
                        params_latest,
                    )
                    row = cur.fetchone()
                    selected_run_date = row[0].isoformat() if row and row[0] else None

                if not selected_run_date:
                    raise HTTPException(status_code=404, detail=f"No hay predicciones para IDEESS {ideess}")

                params_rows.append(selected_run_date)
                cur.execute(
                    f"""
                    SELECT ideess, fuel, forecast_date, run_date, precio_predicho, margen_min, margen_max, favorites_count
                    FROM {PREDICTION_TABLE}
                    WHERE ideess = %s{query_fuel} AND run_date = %s
                    ORDER BY fuel ASC, forecast_date ASC;
                    """,
                    params_rows,
                )
                records = cur.fetchall()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando predicciones: {e}")

    if not records:
        raise HTTPException(status_code=404, detail=f"No hay predicciones para IDEESS {ideess} en run_date={selected_run_date}")

    predictions = []
    for r in records:
        predictions.append(
            {
                "ideess": r[0],
                "fuel": r[1],
                "forecast_date": r[2].isoformat() if isinstance(r[2], date) else str(r[2]),
                "run_date": r[3].isoformat() if isinstance(r[3], date) else str(r[3]),
                "precio_predicho": float(r[4]),
                "margen_min": float(r[5]) if r[5] is not None else None,
                "margen_max": float(r[6]) if r[6] is not None else None,
                "favorites_count": int(r[7]) if r[7] is not None else None,
            }
        )

    return {
        "ideess": ideess,
        "run_date": selected_run_date,
        "fuel_filter": fuel,
        "records": len(predictions),
        "predictions": predictions,
    }


@app.get(
    "/api/prediction/batch",
    summary="Predicciones para múltiples estaciones",
    description=(
        "Devuelve predicciones para una lista de IDEESS en una sola llamada. "
        "Útil para el asistente de voz y el frontend cuando ya se conocen las estaciones cercanas."
    ),
    responses={
        200: {"description": "Predicciones agrupadas por IDEESS"},
        400: {"description": "Parámetros inválidos"},
        500: {"description": "Error consultando predicciones"},
    },
)
def get_batch_predictions(
    ideess: Annotated[
        str,
        Query(description="Lista de IDEESS separados por coma, máximo 20. Ejemplo: 15158,152,10889"),
    ],
    fuel: Annotated[Optional[str], Query(description="Filtra por combustible")] = None,
    run_date: Annotated[
        Optional[str],
        Query(description="YYYY-MM-DD. Si no se indica usa la última ejecución disponible"),
    ] = None,
):
    if not DATABASE_URL:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")

    ids = [s.strip() for s in ideess.split(",") if s.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="ideess es obligatorio")
    if len(ids) > 20:
        raise HTTPException(status_code=400, detail="Máximo 20 IDEESS por petición")

    ensure_prediction_table()

    query_fuel = " AND fuel = %s" if fuel else ""
    extra_params = [fuel] if fuel else []

    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                selected_run_date = run_date
                if not selected_run_date:
                    placeholders = ",".join(["%s"] * len(ids))
                    cur.execute(
                        f"SELECT MAX(run_date) FROM {PREDICTION_TABLE} WHERE ideess IN ({placeholders}){query_fuel}",
                        ids + extra_params,
                    )
                    row = cur.fetchone()
                    selected_run_date = row[0].isoformat() if row and row[0] else None

                if not selected_run_date:
                    return {"run_date": None, "total": 0, "by_station": {}}

                placeholders = ",".join(["%s"] * len(ids))
                cur.execute(
                    f"""
                    SELECT ideess, fuel, forecast_date, run_date,
                           precio_predicho, margen_min, margen_max, favorites_count
                    FROM {PREDICTION_TABLE}
                    WHERE ideess IN ({placeholders}){query_fuel} AND run_date = %s
                    ORDER BY ideess ASC, fuel ASC, forecast_date ASC;
                    """,
                    ids + extra_params + [selected_run_date],
                )
                records = cur.fetchall()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando predicciones: {e}")

    by_station: dict = {}
    for r in records:
        sid = r[0]
        if sid not in by_station:
            by_station[sid] = []
        by_station[sid].append(
            {
                "ideess": r[0],
                "fuel": r[1],
                "forecast_date": r[2].isoformat() if isinstance(r[2], date) else str(r[2]),
                "run_date": r[3].isoformat() if isinstance(r[3], date) else str(r[3]),
                "precio_predicho": float(r[4]),
                "margen_min": float(r[5]) if r[5] is not None else None,
                "margen_max": float(r[6]) if r[6] is not None else None,
                "favorites_count": int(r[7]) if r[7] is not None else None,
            }
        )

    return {
        "run_date": selected_run_date,
        "fuel_filter": fuel,
        "total": len(records),
        "by_station": by_station,
    }


@app.post(
    "/api/prediction/trigger",
    summary="Disparar batch de predicciones",
    description=(
        "Lanza el pipeline batch de entrenamiento y predicción en segundo plano. "
        "Protegido con X-Internal-Secret. "
        "En GCP: Cloud Scheduler llama a este endpoint para lanzar el batch automáticamente."
    ),
    responses={
        202: {"description": "Batch lanzado en segundo plano"},
        401: {"description": "Secreto interno no válido"},
        409: {"description": "Ya hay un batch en ejecución"},
    },
)
def trigger_batch(request: Request):
    from fastapi import BackgroundTasks
    import threading

    secret = request.headers.get("X-Internal-Secret", "")
    if secret != INTERNAL_API_SECRET:
        raise HTTPException(status_code=401, detail="X-Internal-Secret inválido")

    # Evitar ejecuciones simultáneas con un flag simple en memoria
    if getattr(trigger_batch, "_running", False):
        raise HTTPException(status_code=409, detail="Ya hay un batch en ejecución")

    def run_in_thread():
        trigger_batch._running = True
        try:
            run_batch()
        except Exception as e:
            print(f"❌ Error en batch disparado vía API: {e}")
        finally:
            trigger_batch._running = False

    thread = threading.Thread(target=run_in_thread, daemon=True)
    thread.start()

    return {
        "status": "accepted",
        "message": "Batch de predicciones lanzado en segundo plano",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }


if __name__ == "__main__":
    if RUN_HTTP_API:
        print(f"🌐 Iniciando API en {API_HOST}:{API_PORT}")
        uvicorn.run(app, host=API_HOST, port=API_PORT)
    else:
        run_batch()
