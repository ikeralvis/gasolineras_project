"""
main.py — Cloud Run Job para predicción semanal de precios de gasolina
───────────────────────────────────────────────────────────────────────
Flujo:
  1. Descarga todos los parquets de GCS → /tmp/raw/
  2. Descarga precio del Brent (yfinance)
  3. Por cada estación+combustible:
       - Carga modelo .pkl desde GCS (si existe)
       - Reentrena con TODO el histórico acumulado
       - Guarda .pkl actualizado en GCS
       - Genera predicción 7 días
  4. Guarda predicciones en GCS como CSV + Parquet

Variables de entorno necesarias (configura en Cloud Run):
  GCS_BUCKET        → nombre del bucket (obligatorio)
  GCS_RAW_PREFIX    → prefijo carpeta parquets    (default: raw/)
  GCS_MODEL_PREFIX  → prefijo carpeta modelos     (default: modelos_lgbm/)
  GCS_OUTPUT_PREFIX → prefijo carpeta predicciones (default: predicciones/)
  STATION_IDS       → IDs separados por coma      (default: 15158,152,10889)
  FUELS             → combustibles separados por | (default: Precio Gasolina 95 E5|Precio Gasoleo A)
  BRENT_START_DATE  → fecha inicio histórico Brent (default: 2022-01-01)
  FORCE_RETRAIN     → true/false                  (default: false)
"""

import os
import io
import glob
import pickle
import warnings
import tempfile
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import lightgbm as lgb
import yfinance as yf
from sklearn.metrics import mean_absolute_error, mean_squared_error
from google.cloud import storage as gcs

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DESDE VARIABLES DE ENTORNO
# ─────────────────────────────────────────────────────────────────

GCS_BUCKET        = os.environ["GCS_BUCKET"]                          # Obligatorio
GCS_RAW_PREFIX    = os.environ.get("GCS_RAW_PREFIX",    "raw/")
GCS_MODEL_PREFIX  = os.environ.get("GCS_MODEL_PREFIX",  "modelos_lgbm/")
GCS_OUTPUT_PREFIX = os.environ.get("GCS_OUTPUT_PREFIX", "predicciones/")

STATION_IDS   = os.environ.get("STATION_IDS", "15158,152,10889").split(",")
FUELS         = os.environ.get("FUELS", "Precio Gasolina 95 E5|Precio Gasoleo A").split("|")
BRENT_START   = os.environ.get("BRENT_START_DATE", "2022-01-01")
FORCE_RETRAIN = os.environ.get("FORCE_RETRAIN", "false").lower() == "true"

QUANTILE_LOW  = float(os.environ.get("QUANTILE_LOW",  "0.05"))
QUANTILE_HIGH = float(os.environ.get("QUANTILE_HIGH", "0.95"))
MIN_HISTORY   = int(os.environ.get("MIN_HISTORY_DAYS", "60"))

TMP_DIR = Path(tempfile.mkdtemp())   # /tmp/xxxxx — directorio temporal del job
TMP_RAW = TMP_DIR / "raw"
TMP_RAW.mkdir(exist_ok=True)

print(f"🚀 Job iniciado: {datetime.now().isoformat()}")
print(f"   Bucket: {GCS_BUCKET}")
print(f"   Estaciones: {STATION_IDS}")
print(f"   Force retrain: {FORCE_RETRAIN}")

# ─────────────────────────────────────────────────────────────────
# 1. GCS: DESCARGA / SUBIDA
# ─────────────────────────────────────────────────────────────────

_gcs_client = None

def get_gcs():
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = gcs.Client()
    return _gcs_client

def download_raw_parquets() -> list[str]:
    """Descarga todos los parquets de GCS raw/ a /tmp/raw/. Retorna lista de paths locales."""
    client = get_gcs()
    bucket = client.bucket(GCS_BUCKET)
    blobs  = list(bucket.list_blobs(prefix=GCS_RAW_PREFIX))
    parquet_blobs = [b for b in blobs if b.name.endswith(".parquet")]

    print(f"\n📥 Descargando {len(parquet_blobs)} parquets desde GCS...")
    local_paths = []
    for blob in parquet_blobs:
        filename   = Path(blob.name).name
        local_path = TMP_RAW / filename
        if not local_path.exists():          # No re-descargar si ya está (raro en Cloud Run, pero por si acaso)
            blob.download_to_filename(str(local_path))
        local_paths.append(str(local_path))

    print(f"   ✓ {len(local_paths)} parquets en /tmp/raw/")
    return local_paths

def upload_bytes_to_gcs(data: bytes, gcs_path: str):
    """Sube bytes a GCS."""
    client = get_gcs()
    bucket = client.bucket(GCS_BUCKET)
    blob   = bucket.blob(gcs_path)
    blob.upload_from_string(data)
    print(f"  ✓ Subido a GCS: gs://{GCS_BUCKET}/{gcs_path}")

def download_bytes_from_gcs(gcs_path: str):
    """Descarga bytes desde GCS. Retorna None si no existe."""
    client = get_gcs()
    bucket = client.bucket(GCS_BUCKET)
    blob   = bucket.blob(gcs_path)
    if not blob.exists():
        return None
    return blob.download_as_bytes()

# ─────────────────────────────────────────────────────────────────
# 2. MODELOS: CARGA / GUARDADO EN GCS
# ─────────────────────────────────────────────────────────────────

def model_gcs_path(station, fuel):
    fuel_clean = fuel.replace(" ", "_").replace("/", "-")
    return f"{GCS_MODEL_PREFIX}{station}_{fuel_clean}.pkl"

def save_model(models, feature_cols, station, fuel):
    data = pickle.dumps({"models": models, "feature_cols": feature_cols})
    upload_bytes_to_gcs(data, model_gcs_path(station, fuel))

def load_model(station, fuel):
    raw = download_bytes_from_gcs(model_gcs_path(station, fuel))
    if raw is None:
        print(f"  → Sin modelo previo en GCS para {station} | {fuel}")
        return None, None
    d = pickle.loads(raw)
    print(f"  ✓ Modelo cargado desde GCS")
    return d["models"], d["feature_cols"]

# ─────────────────────────────────────────────────────────────────
# 3. CARGA DE DATOS
# ─────────────────────────────────────────────────────────────────

def load_raw_data() -> pd.DataFrame:
    files = list(TMP_RAW.glob("*.parquet"))
    print(f"\n📂 Cargando {len(files)} parquets...")
    dfs = []
    for f in files:
        try:
            d = pd.read_parquet(f)
            if "IDEESS" in d.columns:
                dfs.append(d)
        except Exception as e:
            print(f"  ⚠️  Error leyendo {f.name}: {e}")

    df = pd.concat(dfs, ignore_index=True)

    def parse_price(col):
        return (
            df[col].astype(str)
            .replace("", np.nan)
            .str.replace(",", ".", regex=False)
            .astype(float)
        )

    for c in ["Precio Gasolina 95 E5", "Precio Gasoleo A"]:
        if c in df.columns:
            df[c] = parse_price(c)

    df["fecha"]  = pd.to_datetime(df["fecha_registro"], unit="ms").dt.normalize()
    df["IDEESS"] = df["IDEESS"].astype(str).str.strip()
    print(f"   Shape total: {df.shape}")
    return df

# ─────────────────────────────────────────────────────────────────
# 4. BRENT
# ─────────────────────────────────────────────────────────────────

def load_brent() -> pd.DataFrame | None:
    print(f"\n📈 Descargando Brent desde {BRENT_START}...")
    try:
        raw = yf.download("BZ=F", start=BRENT_START, progress=False, auto_adjust=True)
        if raw.empty:
            print("  ⚠️  Brent vacío. Continuando sin él.")
            return None

        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)

        brent_df = raw[["Close"]].reset_index().rename(columns={"Date": "fecha", "Close": "brent"})
        brent_df["fecha"] = pd.to_datetime(brent_df["fecha"]).dt.normalize()

        all_days = pd.date_range(brent_df["fecha"].min(), brent_df["fecha"].max(), freq="D")
        brent_df = brent_df.set_index("fecha").reindex(all_days).rename_axis("fecha").reset_index()
        brent_df["brent"] = brent_df["brent"].ffill()

        print(f"  ✓ Brent: {len(brent_df)} días | último: {brent_df['fecha'].max().date()} = {brent_df['brent'].iloc[-1]:.2f} USD")
        return brent_df
    except Exception as e:
        print(f"  ⚠️  Error Brent: {e}. Continuando sin él.")
        return None

# ─────────────────────────────────────────────────────────────────
# 5. SERIE TEMPORAL + FEATURES
# ─────────────────────────────────────────────────────────────────

def build_ts(df, station, fuel):
    d  = df[df["IDEESS"] == station].copy()
    ts = d.groupby("fecha")[fuel].mean().sort_index()
    all_days = pd.date_range(ts.index.min(), ts.index.max(), freq="D")
    ts = ts.reindex(all_days).ffill().bfill()
    return ts.reset_index().rename(columns={"index": "fecha", fuel: "y"})

def add_features(ts, brent_df=None):
    df_feat = ts.copy().sort_values("fecha").reset_index(drop=True)
    df_feat["dia_semana"]       = df_feat["fecha"].dt.dayofweek
    df_feat["es_fin_de_semana"] = (df_feat["dia_semana"] >= 5).astype(int)
    df_feat["semana_anio"]      = df_feat["fecha"].dt.isocalendar().week.astype(int)
    df_feat["mes"]              = df_feat["fecha"].dt.month
    df_feat["trimestre"]        = df_feat["fecha"].dt.quarter
    df_feat["dia_mes"]          = df_feat["fecha"].dt.day
    for lag in [1, 7, 14, 21, 30]:
        df_feat[f"lag_{lag}"] = df_feat["y"].shift(lag)
    for w in [7, 14, 30]:
        df_feat[f"roll_mean_{w}"] = df_feat["y"].shift(1).rolling(w).mean()
    df_feat["roll_std_7"] = df_feat["y"].shift(1).rolling(7).std()
    df_feat["diff_1d"]    = df_feat["y"].diff(1)
    df_feat["diff_7d"]    = df_feat["y"].diff(7)
    if brent_df is not None:
        df_feat = df_feat.merge(brent_df[["fecha", "brent"]], on="fecha", how="left")
        df_feat["brent"]        = df_feat["brent"].ffill()
        df_feat["lag_brent_1"]  = df_feat["brent"].shift(1)
        df_feat["lag_brent_7"]  = df_feat["brent"].shift(7)
        df_feat["diff_brent_7"] = df_feat["brent"].diff(7)
    return df_feat

BASE_FEATURES  = [
    "dia_semana", "es_fin_de_semana", "semana_anio", "mes", "trimestre", "dia_mes",
    "lag_1", "lag_7", "lag_14", "lag_21", "lag_30",
    "roll_mean_7", "roll_mean_14", "roll_mean_30",
    "roll_std_7", "diff_1d", "diff_7d",
]
BRENT_FEATURES = ["brent", "lag_brent_1", "lag_brent_7", "diff_brent_7"]

def get_feature_cols(brent_df):
    return BASE_FEATURES + (BRENT_FEATURES if brent_df is not None else [])

# ─────────────────────────────────────────────────────────────────
# 6. ENTRENAMIENTO
# ─────────────────────────────────────────────────────────────────

LGBM_BASE = {
    "boosting_type": "gbdt", "n_estimators": 400, "learning_rate": 0.04,
    "num_leaves": 31, "min_child_samples": 10, "subsample": 0.8,
    "colsample_bytree": 0.8, "verbose": -1, "n_jobs": -1,
}

def train_lgbm(ts, brent_df=None):
    df_feat      = add_features(ts, brent_df).dropna()
    feature_cols = [c for c in get_feature_cols(brent_df) if c in df_feat.columns]
    X, y         = df_feat[feature_cols], df_feat["y"]
    models = {}
    for quantile, label in [(QUANTILE_LOW, "low"), (0.50, "mid"), (QUANTILE_HIGH, "high")]:
        m = lgb.LGBMRegressor(**{**LGBM_BASE, "objective": "quantile", "alpha": quantile})
        m.fit(X, y)
        models[label] = m
    return models, df_feat, feature_cols

# ─────────────────────────────────────────────────────────────────
# 7. FORECAST RECURSIVO
# ─────────────────────────────────────────────────────────────────

def forecast_7d(models, ts, df_feat, feature_cols, brent_df=None):
    last_date  = ts["fecha"].max()
    all_y      = list(df_feat["y"].values)
    all_brent  = list(df_feat["brent"].values) if "brent" in df_feat.columns else []
    preds      = {"fecha": [], "precio_predicho": [], "margen_min": [], "margen_max": []}

    for i in range(7):
        next_date = last_date + pd.Timedelta(days=i + 1)

        def lag(n):
            idx = len(all_y) - n
            return all_y[idx] if idx >= 0 else np.nan

        row = {
            "dia_semana": next_date.dayofweek,
            "es_fin_de_semana": int(next_date.dayofweek >= 5),
            "semana_anio": int(next_date.isocalendar()[1]),
            "mes": next_date.month, "trimestre": next_date.quarter, "dia_mes": next_date.day,
            "lag_1": lag(1), "lag_7": lag(7), "lag_14": lag(14), "lag_21": lag(21), "lag_30": lag(30),
            "roll_mean_7":  np.mean(all_y[-7:])  if len(all_y) >= 7  else np.nan,
            "roll_mean_14": np.mean(all_y[-14:]) if len(all_y) >= 14 else np.nan,
            "roll_mean_30": np.mean(all_y[-30:]) if len(all_y) >= 30 else np.nan,
            "roll_std_7":   np.std(all_y[-7:])   if len(all_y) >= 7  else np.nan,
            "diff_1d": all_y[-1] - all_y[-2] if len(all_y) >= 2 else 0,
            "diff_7d": all_y[-1] - all_y[-8] if len(all_y) >= 8 else 0,
        }
        if brent_df is not None and len(all_brent) > 0:
            future_brent       = brent_df[brent_df["fecha"] <= next_date]
            row["brent"]       = future_brent["brent"].iloc[-1] if len(future_brent) > 0 else all_brent[-1]
            row["lag_brent_1"] = all_brent[-1] if len(all_brent) >= 1 else np.nan
            row["lag_brent_7"] = all_brent[-7] if len(all_brent) >= 7 else np.nan
            row["diff_brent_7"]= (all_brent[-1] - all_brent[-7]) if len(all_brent) >= 7 else 0
            all_brent.append(row["brent"])

        X_pred = pd.DataFrame([row])[[c for c in feature_cols if c in row]]
        p_mid  = models["mid"].predict(X_pred)[0]
        p_low  = min(models["low"].predict(X_pred)[0], p_mid)
        p_high = max(models["high"].predict(X_pred)[0], p_mid)

        preds["fecha"].append(next_date)
        preds["precio_predicho"].append(round(p_mid, 3))
        preds["margen_min"].append(round(p_low, 3))
        preds["margen_max"].append(round(p_high, 3))
        all_y.append(p_mid)

    return pd.DataFrame(preds)

# ─────────────────────────────────────────────────────────────────
# 8. GUARDAR PREDICCIONES EN GCS
# ─────────────────────────────────────────────────────────────────

def save_predictions(pred_df: pd.DataFrame, run_date: str):
    for fmt in ["csv", "parquet"]:
        filename = f"predicciones_{run_date}.{fmt}"
        buf = io.BytesIO()
        if fmt == "csv":
            pred_df.to_csv(buf, index=False, decimal=",", sep=";")
        else:
            pred_df.to_parquet(buf, index=False)
        upload_bytes_to_gcs(buf.getvalue(), GCS_OUTPUT_PREFIX + filename)

# ─────────────────────────────────────────────────────────────────
# 9. PIPELINE PRINCIPAL
# ─────────────────────────────────────────────────────────────────

def run():
    run_date = datetime.today().strftime("%Y-%m-%d")

    # Paso 1: descargar parquets de GCS
    download_raw_parquets()

    # Paso 2: cargar datos en memoria
    df = load_raw_data()

    # Paso 3: Brent
    brent_df = load_brent()

    # Paso 4: entrenar y predecir
    all_preds = []
    for st in STATION_IDS:
        print(f"\n📍 Estación: {st}")
        for fuel in FUELS:
            print(f"  ⛽ {fuel}")
            ts = build_ts(df, st, fuel)

            if len(ts) < MIN_HISTORY:
                print("  → Pocos datos, skip")
                continue

            # Cargar pkl si existe y no forzamos reentrenamiento
            models, feature_cols = None, None
            if not FORCE_RETRAIN:
                models, feature_cols = load_model(st, fuel)

            # Siempre reentrenamos con el histórico completo actualizado
            print("  → Entrenando con histórico completo...")
            models, df_feat, feature_cols = train_lgbm(ts, brent_df)
            save_model(models, feature_cols, st, fuel)

            df_feat = add_features(ts, brent_df).dropna()
            fc = forecast_7d(models, ts, df_feat, feature_cols, brent_df)
            fc["IDEESS"]   = st
            fc["fuel"]     = fuel
            fc["run_date"] = run_date
            all_preds.append(fc)
            print(f"  ✓ Predicción generada")

    pred_df = pd.concat(all_preds, ignore_index=True)

    print(f"\n💾 Guardando predicciones en GCS...")
    save_predictions(pred_df, run_date)

    print(f"\n✅ Job completado: {datetime.now().isoformat()}")
    print(pred_df.to_string(index=False))

if __name__ == "__main__":
    run()