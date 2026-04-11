# Recomendacion Service en GCP: Secret Manager + Cloud Run

## Objetivo
Evitar hardcoding de API keys de mapas (ORS, Mapbox, Google Places) y mantener el servicio stateless y escalable.

## Arquitectura
- Compute: Cloud Run `recomendacion-service`
- Secretos: Secret Manager
- Build: Cloud Build + Artifact Registry
- Runtime identity: Service Account dedicada al servicio

## Secretos
- `ors-api-key`
- `mapbox-access-token`
- `google-places-api-key`

## Variables de entorno no secretas
- `ROUTING_BACKEND`
- `ROUTE_CANDIDATES_SOURCE`
- `POI_ACCESS_PROVIDER`
- `GASOLINERAS_API_URL`
- `DATABASE_URL` (si se gestiona por Secret Manager, moverlo también a secreto)

## Flujo de despliegue recomendado
1. Cloud Build construye y publica imagen.
2. Cloud Run despliega imagen.
3. Cloud Run inyecta secretos como env vars con `--set-secrets`.
4. El contenedor lee configuración desde entorno (`app.config.Settings`).

## Comandos de ejemplo
```bash
gcloud secrets create ors-api-key --replication-policy="automatic"
gcloud secrets versions add ors-api-key --data-file=./ors_key.txt

gcloud secrets create mapbox-access-token --replication-policy="automatic"
gcloud secrets versions add mapbox-access-token --data-file=./mapbox_token.txt

gcloud secrets create google-places-api-key --replication-policy="automatic"
gcloud secrets versions add google-places-api-key --data-file=./google_places_key.txt

# Permisos al runtime service account
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/secretmanager.secretAccessor"

# Deploy Cloud Run
gcloud run deploy recomendacion-service \
  --image europe-west1-docker.pkg.dev/PROJECT_ID/tankgo/recomendacion-img \
  --region europe-west1 \
  --platform managed \
  --set-env-vars ROUTING_BACKEND=ors,ROUTE_CANDIDATES_SOURCE=auto,POI_ACCESS_PROVIDER=auto \
  --set-secrets ORS_API_KEY=ors-api-key:latest,MAPBOX_ACCESS_TOKEN=mapbox-access-token:latest,GOOGLE_PLACES_API_KEY=google-places-api-key:latest
```

## Consideraciones de escalado
- El servicio no persiste estado local de negocio.
- Cada request es independiente.
- Compatible con múltiples instancias Cloud Run.
- Ajustar concurrencia/CPU según latencia de APIs de mapas.
