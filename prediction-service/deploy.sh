# ─────────────────────────────────────────────────────────────────
# GUÍA DE DESPLIEGUE EN GOOGLE CLOUD RUN
# ─────────────────────────────────────────────────────────────────
# Requisitos: gcloud CLI instalado y autenticado
# ─────────────────────────────────────────────────────────────────

# 1. VARIABLES (cambia estos valores)
PROJECT_ID="tu-proyecto-gcp"
BUCKET_NAME="tu-bucket-gasolina"
REGION="europe-west1"
IMAGE="gcr.io/$PROJECT_ID/prediccion-gasolina"

# ─────────────────────────────────────────────────────────────────
# 2. CREAR BUCKET GCS (solo la primera vez)
# ─────────────────────────────────────────────────────────────────
gcloud storage buckets create gs://$BUCKET_NAME \
    --location=$REGION \
    --project=$PROJECT_ID

# Estructura de carpetas (se crean solas al subir el primer archivo):
# gs://tu-bucket/raw/           ← tus parquets
# gs://tu-bucket/modelos_lgbm/  ← pkl automático
# gs://tu-bucket/predicciones/  ← output automático

# Subir parquets históricos la primera vez:
gcloud storage cp /ruta/local/raw/*.parquet gs://$BUCKET_NAME/raw/

# Cada semana, subir solo el nuevo parquet:
gcloud storage cp nuevo_parquet.parquet gs://$BUCKET_NAME/raw/


# ─────────────────────────────────────────────────────────────────
# 3. BUILD Y PUSH DE LA IMAGEN DOCKER
# ─────────────────────────────────────────────────────────────────
# Desde la carpeta donde tienes Dockerfile, main.py y requirements.txt:

gcloud builds submit --tag $IMAGE


# ─────────────────────────────────────────────────────────────────
# 4. DESPLEGAR COMO CLOUD RUN JOB
# ─────────────────────────────────────────────────────────────────
# Usamos Cloud Run JOB (no Service) porque es una tarea que
# arranca, hace su trabajo y termina. No es un servidor HTTP.

gcloud run jobs create prediccion-gasolina \
    --image=$IMAGE \
    --region=$REGION \
    --memory=4Gi \
    --cpu=2 \
    --task-timeout=600 \
    --set-env-vars="GCS_BUCKET=$BUCKET_NAME" \
    --set-env-vars="STATION_IDS=15158,152,10889" \
    --set-env-vars="FUELS=Precio Gasolina 95 E5|Precio Gasoleo A" \
    --set-env-vars="BRENT_START_DATE=2022-01-01" \
    --set-env-vars="FORCE_RETRAIN=false" \
    --set-env-vars="QUANTILE_LOW=0.05" \
    --set-env-vars="QUANTILE_HIGH=0.95"

# Para actualizar variables de entorno después:
gcloud run jobs update prediccion-gasolina \
    --region=$REGION \
    --set-env-vars="STATION_IDS=15158,152,10889,NUEVA_ESTACION"

# Para ejecutar manualmente (testing):
gcloud run jobs execute prediccion-gasolina --region=$REGION


# ─────────────────────────────────────────────────────────────────
# 5. AUTOMATIZAR CON CLOUD SCHEDULER (ejecución semanal)
# ─────────────────────────────────────────────────────────────────
# Crear cuenta de servicio para el scheduler:
gcloud iam service-accounts create scheduler-sa \
    --display-name="Scheduler para prediccion gasolina"

# Dar permisos para ejecutar el job:
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:scheduler-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/run.invoker"

# Crear el scheduler (cada lunes a las 6:00 AM):
gcloud scheduler jobs create http prediccion-semanal \
    --location=$REGION \
    --schedule="0 6 * * 1" \
    --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/prediccion-gasolina:run" \
    --http-method=POST \
    --oauth-service-account-email="scheduler-sa@$PROJECT_ID.iam.gserviceaccount.com"


# ─────────────────────────────────────────────────────────────────
# 6. FLUJO SEMANAL COMPLETO
# ─────────────────────────────────────────────────────────────────
# Cada semana el flujo es:
#
#   LUNES 05:59 → Tú subes el nuevo parquet a GCS:
#     gcloud storage cp datos_semana_XX.parquet gs://$BUCKET_NAME/raw/
#
#   LUNES 06:00 → Cloud Scheduler dispara el job automáticamente
#
#   El job:
#     1. Descarga TODOS los parquets de gs://bucket/raw/ → /tmp/
#     2. Descarga Brent actualizado (yfinance)
#     3. Reentrena con todo el histórico acumulado
#     4. Guarda .pkl actualizados en gs://bucket/modelos_lgbm/
#     5. Guarda predicciones en gs://bucket/predicciones/predicciones_YYYY-MM-DD.csv
#     6. Termina (el contenedor se destruye, los datos persisten en GCS)


# ─────────────────────────────────────────────────────────────────
# 7. VER LOGS DEL JOB
# ─────────────────────────────────────────────────────────────────
gcloud run jobs executions list --job=prediccion-gasolina --region=$REGION
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=prediccion-gasolina" \
    --limit=50 --format="value(textPayload)"