# Playbook UI: Artifact Registry + Cloud Build Triggers + Cloud Run

Este documento describe como desplegar por interfaz web (sin CLI) y como configurar puertos, variables e instancias para local Docker y Cloud Run.

## 1) Regla de puertos para que funcione en local y Cloud Run

- Local Docker Compose:
  - Cada servicio escucha en su puerto interno historico (3001, 8000, 8080, etc.)
  - El mapeo host:contenedor lo resuelve `docker-compose.yml`
- Cloud Run:
  - Cloud Run inyecta `PORT=8080`
  - El proceso dentro del contenedor debe escuchar en `process.env.PORT` o `${PORT}`

Estado actual del repo tras ajustes:

- usuarios-service: ok (`process.env.PORT`)
- gasolineras-service: ok (`${PORT:-8000}`)
- gateway-hono: ok (`process.env.PORT`)
- recomendacion-service: ajustado para `${PORT:-8001}`
- voice-assistant-service: ok (`process.env.PORT`)
- prediction-service: ajustado para mapear `API_PORT` desde `PORT`
- frontend-client: escucha 8080 en nginx; compose mapea a 8080 del contenedor
- mcp-gasolineras-server: no es HTTP (stdio), no desplegar como Cloud Run service

## 2) Que imagen y trigger crear por microservicio

Cloud Build config por servicio:

Los `cloudbuild-*.yaml` HTTP estan en modo **build + push + deploy automatico**.
Para evitar fallos IAM en triggers, los pipelines no fuerzan `--allow-unauthenticated`.
La visibilidad (publico/privado) se configura en Cloud Run UI y queda persistente entre revisiones.

- frontend-client: `cloudbuild-frontend.yaml`
- usuarios-service: `cloudbuild-usuarios.yaml`
- gasolineras-service: `cloudbuild-gasolineras.yaml`
- gateway-hono: `cloudbuild-gateway.yaml`
- recomendacion-service: `cloudbuild-recomendacion.yaml`
- voice-assistant-service: `cloudbuild-voice.yaml`
- prediction-service: `cloudbuild-prediccion.yaml`
- mcp-gasolineras-server: `cloudbuild-mcp-gasolineras.yaml` (solo build/push)

## 3) UI paso a paso: Artifact Registry

1. Ve a Google Cloud Console -> Artifact Registry.
2. Crea repositorio Docker llamado `tankgo` en region `europe-west1`.
3. Formato: Docker.
4. Permisos:
   - Cloud Build service account con `Artifact Registry Writer`.
   - Cloud Run service account con `Artifact Registry Reader`.

## 4) UI paso a paso: Cloud Build Triggers

1. Ve a Cloud Build -> Triggers -> Create trigger.
2. Conecta tu repo GitHub.
3. Define un trigger por microservicio.
4. Evento recomendado:
   - Push to branch `main`.
   - Include files por carpeta para evitar despliegues innecesarios.
5. Marca "Use the service account configured for this trigger" y asigna permisos:
  - Cloud Run Admin
  - Service Account User (sobre la runtime SA)
  - Artifact Registry Writer

Patrones recomendados por trigger:

- usuarios:
  - `usuarios-service/**`
  - `cloudbuild-usuarios.yaml`
- gasolineras:
  - `gasolineras-service/**`
  - `cloudbuild-gasolineras.yaml`
- gateway:
  - `gateway-hono/**`
  - `cloudbuild-gateway.yaml`
- recomendacion:
  - `recomendacion-service/**`
  - `cloudbuild-recomendacion.yaml`
- frontend:
  - `frontend-client/**`
  - `cloudbuild-frontend.yaml`
- voice:
  - `voice-assistant-service/**`
  - `cloudbuild-voice.yaml`
- prediction:
  - `prediction-service/**`
  - `cloudbuild-prediccion.yaml`

## 5) UI paso a paso: Cloud Run (sin CLI)

Para cada servicio en Cloud Run:

1. Cloud Run -> Create service.
2. Selecciona imagen desde Artifact Registry (`tankgo/<service>-img`).
3. Region: `europe-west1`.
4. Authentication:
  - Aplica la matriz de visibilidad recomendada de la seccion 5.1.
5. Container port:
   - Deja 8080 (default Cloud Run).
6. Variables y secretos:
   - Configura env vars y secretos en la pestana Variables & Secrets.
7. Deploy.

### 5.1 Visibilidad recomendada (publico vs privado)

- `frontend-client`: **Publico** (sitio web)
- `gateway-hono`: **Publico** (entrypoint API del frontend)
- `usuarios-service`: **Privado** (solo lo invoca gateway)
- `gasolineras-service`: **Privado** (solo lo invoca gateway)
- `recomendacion-service`: **Privado** (solo lo invoca gateway)
- `voice-assistant-service`: **Privado** si pasa por gateway; **Publico** solo si frontend conecta directo WS
- `prediction-service`: **Privado** por defecto; **Publico** solo si expones su API externamente
- `mcp-gasolineras-server`: no desplegar como Cloud Run service HTTP

Regla practica: expone publicamente solo `frontend-client` y `gateway-hono`.

### 5.2 Evitar 403 cuando Gateway llama servicios privados

Si `gateway-hono` es publico y `usuarios/gasolineras/recomendacion` son privados, debes tener:

1. URL internas correctas en gateway:
  - `USUARIOS_SERVICE_URL=https://<usuarios>.run.app`
  - `GASOLINERAS_SERVICE_URL=https://<gasolineras>.run.app`
  - `RECOMENDACION_SERVICE_URL=https://<recomendacion>.run.app`
2. Runtime Service Account del gateway con rol `Cloud Run Invoker` sobre cada servicio privado.
3. Variable en gateway:
  - `CLOUD_RUN_SERVICE_AUTH_ENABLED=true`

Este repo ya incluye envio automatico de `X-Serverless-Authorization` desde el gateway cuando detecta destino `*.run.app`, para no romper tu JWT de usuario en `Authorization`.

## 6) Variables minimas por servicio

### usuarios-service
Obligatorias:
- `DATABASE_URL` (Secret Manager recomendado)
- `JWT_SECRET` (Secret Manager recomendado)

Recomendadas:
- `JWT_EXPIRES_IN=7d`
- `NODE_ENV=production`
- `ALLOWED_ORIGINS=https://<frontend-url>`

### gasolineras-service
Obligatorias:
- `DATABASE_URL`

Recomendadas:
- `USUARIOS_SERVICE_URL=https://<usuarios-service-url>`
- `INTERNAL_API_SECRET=<secret>`
- `AUTO_ENSURE_FRESH_ON_STARTUP=true`

### gateway-hono
Obligatorias:
- `USUARIOS_SERVICE_URL=https://<usuarios-url>`
- `GASOLINERAS_SERVICE_URL=https://<gasolineras-url>`

Si usas recomendacion y voz:
- `RECOMENDACION_SERVICE_URL=https://<recomendacion-url>`
- `VOICE_ASSISTANT_SERVICE_URL=https://<voice-url>`

Si usas ORS:
- `ORS_API_KEY=<secret>`

### recomendacion-service
Obligatorias:
- `DATABASE_URL`
- `GASOLINERAS_API_URL=https://<gateway-url>/api/gasolineras/?limit=20000`

Opcionales:
- `ROUTING_PROXY_URL=https://<gateway-url>/api/routing`
- `ROUTING_BACKEND=ors`

### voice-assistant-service
Obligatorias:
- `GATEWAY_BASE_URL=https://<gateway-url>`
- `OPENAI_API_KEY=<secret>`

Recomendadas:
- `INTERNAL_API_SECRET=<secret>`

### prediction-service
Para correr como API en Cloud Run:
- `RUN_HTTP_API=true`
- `API_HOST=0.0.0.0`
- `DATABASE_URL=<secret>`

Si consume favoritos:
- `USUARIOS_SERVICE_URL=https://<usuarios-url>`
- `INTERNAL_API_SECRET=<secret>`

## 7) Instancias y recursos recomendados

Valores iniciales (luego ajustar por metricas):

- frontend-client:
  - CPU: 1
  - RAM: 512Mi
  - Min instances: 0
  - Max instances: 3
  - Concurrency: 80
- gateway-hono:
  - CPU: 1
  - RAM: 512Mi
  - Min instances: 0 o 1 (1 si quieres menos cold starts)
  - Max instances: 10
  - Concurrency: 80
- usuarios-service:
  - CPU: 1
  - RAM: 512Mi
  - Min instances: 0
  - Max instances: 5
  - Concurrency: 40
- gasolineras-service:
  - CPU: 1
  - RAM: 1Gi
  - Min instances: 0
  - Max instances: 5
  - Concurrency: 40
- recomendacion-service:
  - CPU: 1
  - RAM: 1Gi
  - Min instances: 0
  - Max instances: 5
  - Concurrency: 20
- voice-assistant-service:
  - CPU: 1
  - RAM: 1Gi
  - Min instances: 0
  - Max instances: 5
  - Concurrency: 10
- prediction-service:
  - CPU: 2
  - RAM: 2Gi
  - Min instances: 0
  - Max instances: 2
  - Concurrency: 1-5

## 8) Arquitectura recomendada (que si/no poner en Cloud Run)

- Mantener en Cloud Run services:
  - frontend-client
  - gateway-hono
  - usuarios-service
  - gasolineras-service
  - recomendacion-service
  - voice-assistant-service (si necesitas websocket/HTTP)
- prediction-service:
  - Si es API online, Cloud Run service.
  - Si es batch pesado, mejor Cloud Run Jobs + scheduler.
- mcp-gasolineras-server:
  - No ideal en Cloud Run service porque usa stdio, no HTTP.
  - Mejor como proceso interno, VM, o adaptar a HTTP si quieres exponerlo como servicio.

## 9) Checklist rapido cuando salga error PORT=8080

1. Abrir Logs de revision en Cloud Run.
2. Verificar si el proceso cayo por variable faltante (`DATABASE_URL`, `JWT_SECRET`, etc.).
3. Confirmar que el entrypoint usa `PORT`.
4. Confirmar que el servicio esta en `0.0.0.0`.
5. Aumentar startup timeout si el arranque inicial tarda.

## 10) Caso real: Trigger falla con IAM + PORT en usuarios-service

Si en Cloud Build Trigger ves algo como:

- `Setting IAM policy failed ... allUsers roles/run.invoker`
- `failed to start and listen on the port defined by PORT=8080`

haz esto en UI:

1. Mantén el trigger con deploy automatico.
2. Ve a Cloud Run -> `usuarios-service` -> Edit & Deploy New Revision.
3. Selecciona la imagen nueva de Artifact Registry `tankgo/usuarios-img`.
4. En `Container port`, deja `8080`.
5. En `Variables & Secrets`, define obligatorio:
  - `DATABASE_URL` (ideal via Secret Manager)
  - `JWT_SECRET` (ideal via Secret Manager)
6. Opcionales recomendadas:
  - `JWT_EXPIRES_IN=7d`
  - `NODE_ENV=production`
  - `ALLOWED_ORIGINS=https://<tu-frontend>`
7. En `Security`:
  - Si no necesitas publico, deja `Require authentication` (evita error de IAM allUsers).
  - Si quieres publico, activa `Allow unauthenticated` solo si tu cuenta tiene permisos IAM para policy binding.

Nota: en este servicio, el error de puerto suele ser secundario; normalmente el proceso cae por variables faltantes (`DATABASE_URL` o `JWT_SECRET`) antes de empezar a escuchar.
