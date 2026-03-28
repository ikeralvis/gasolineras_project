# Contexto del proyecto

## 1) Arquitectura actual (resumen)

Proyecto orientado a microservicios con un gateway central.

- API Gateway: `gateway-hono`
- Servicio principal de negocio (combustible + EV): `gasolineras-service`
- Servicio de usuarios/auth/favoritos: `usuarios-service`
- Servicio de recomendacion de ruta: `recomendacion-service`
- Frontend web: `frontend-client`
- Servicios opcionales (profile `ai`): `voice-assistant-service`, `mcp-gasolineras-server`
- Servicio opcional de prediccion: `prediction-service` (si se configura en gateway)

Nota clave: EV charging ya no va en microservicio aparte. Ahora esta integrado dentro de `gasolineras-service`.

## 2) Servicios en docker-compose y dependencias

Servicios activos por defecto:

- `gasolineras`
  - depende de: DB cloud por `DATABASE_URL` (Neon/Supabase/PostgreSQL)
- `usuarios`
  - depende de: DB cloud por `DATABASE_URL`
- `gateway`
  - depende de: `usuarios` (healthy), `gasolineras` (healthy)
- `recomendacion`
  - depende de: `gateway` (started)
- `frontend`
  - depende de: `gateway` (healthy)

Servicios por profile `ai`:

- `mcp-gasolineras`
  - depende de: `gateway` (healthy)
- `voice-assistant`
  - depende de: `gateway` (healthy)

## 3) Endpoints principales por servicio

### 3.1 gateway-hono

Base: `http://<host>:8080`

- `GET /`
- `GET /health`
- `GET /docs`
- `GET /openapi.json`
- `GET /api/geocoding/search`
- `GET /api/geocoding/reverse`
- `POST /api/auth/google/verify`
- `POST /api/auth/logout`
- `ALL /api/usuarios/*`
- `ALL /api/gasolineras/*`
- `ALL /api/recomendacion/*`
- `ALL /api/recomendaciones/*`
- `ALL /api/charging/*` (EV integrado, proxy hacia `gasolineras-service`)
- `ALL /api/prediction/*` (si `PREDICTION_SERVICE_URL` esta configurado)
- `ALL /api/voice/*` (si voice assistant esta activo)

### 3.2 gasolineras-service

Base: `http://<host>:8000`

General:

- `GET /`
- `GET /health`

Gasolineras:

- `GET /gasolineras/`
- `GET /gasolineras/cerca`
- `POST /gasolineras/markers`
- `POST /gasolineras/sync` (requiere `X-Internal-Secret`)
- `POST /gasolineras/ensure-fresh` (requiere `X-Internal-Secret`)
- `GET /gasolineras/count`
- `GET /gasolineras/snapshot`
- `GET /gasolineras/estadisticas`
- `GET /gasolineras/{id}`
- `GET /gasolineras/{id}/cercanas`
- `GET /gasolineras/{id}/historial`

EV integrado (canonico):

- `GET /api/charging/health`
- `POST /api/charging/markers`
- `GET /api/charging/details/{location_id}`

Alias internos (no canonicos para clientes):

- `GET /gasolineras/ev/health`
- `POST /gasolineras/ev/markers`
- `GET /gasolineras/ev/details/{location_id}`

### 3.3 usuarios-service

Base: `http://<host>:3001`

Sistema:

- `GET /`
- `GET /openapi.json`
- `GET /health`
- `GET /ready`
- `GET /live`

Auth/usuarios (prefijo `/api/usuarios`):

- `POST /register`
- `POST /login`
- `GET /me`
- `PATCH /me`
- `DELETE /me`
- `GET /`
- `POST /google/internal` (uso interno via gateway)

Favoritos (prefijo `/api/usuarios`):

- `POST /favoritos`
- `GET /favoritos`
- `DELETE /favoritos/:ideess`
- `GET /favoritos/all-ideess`

### 3.4 recomendacion-service

Base: `http://<host>:8001`

- `GET /`
- `GET /health`
- `POST /recomendacion/ruta`
- `GET /recomendacion/cercanas`
- `GET /recomendacion/combustibles`

### 3.5 frontend-client

No expone API de backend. Consume `gateway` via `VITE_API_BASE_URL`.

### 3.6 voice-assistant-service (profile ai)

Base: `http://<host>:8090`

- `GET /health`
- `POST /voice/transcribe`
- `POST /voice/intent`

### 3.7 mcp-gasolineras-server (profile ai)

Servicio MCP por stdio (no API HTTP publica principal).
Usa herramientas para invocar endpoints del gateway.

## 4) Variables de entorno por servicio

## 4.1 Globales importantes

- `DATABASE_URL` (compartida por servicios que usan PostgreSQL)
- `INTERNAL_API_SECRET` (llamadas internas seguras)
- `GATEWAY_PORT`, `GASOLINERAS_PORT`, `USUARIOS_PORT`, `RECOMENDACION_PORT`, `FRONTEND_PORT`, `VOICE_ASSISTANT_PORT`

## 4.2 gateway-hono

Requeridas:

- `USUARIOS_SERVICE_URL`
- `GASOLINERAS_SERVICE_URL`
- `RECOMENDACION_SERVICE_URL`
- `INTERNAL_API_SECRET`
- `GOOGLE_CLIENT_ID` (si se usa login Google)

Opcionales:

- `PREDICTION_SERVICE_URL`
- `VOICE_ASSISTANT_SERVICE_URL`
- `FRONTEND_URL`, `FRONTEND_URLS`, `GATEWAY_PUBLIC_URL`
- `OPENAPI_TIMEOUT_MS`, `OPENAPI_RETRY_MS`, `OPENAPI_REFRESH_MS`
- `HEALTH_TIMEOUT_MS`
- `GASOLINERAS_AUTO_ENSURE_FRESH_ENABLED`, `GASOLINERAS_STARTUP_ENSURE_FRESH`, `GASOLINERAS_AUTO_ENSURE_INTERVAL_MINUTES`
- `NODE_ENV`

## 4.3 gasolineras-service

Requeridas para modo PostgreSQL:

- `DATABASE_URL`

Opcionales (fallback y operacion):

- `INTERNAL_API_SECRET`
- `USUARIOS_SERVICE_URL`
- `AUTO_ENSURE_FRESH_ON_STARTUP`
- `AUTO_SYNC_ON_READ`
- `AUTO_SYNC_COOLDOWN_MINUTES`
- `HISTORICAL_SCOPE`
- `CORS_ORIGINS`

Nota: si no hay `DATABASE_URL` o no hay driver PostgreSQL, el servicio entra en `memory-fallback` y sigue funcionando.

## 4.4 usuarios-service

Requeridas:

- `DATABASE_URL`
- `JWT_SECRET`

Opcionales:

- `PORT`, `HOST`, `NODE_ENV`
- `JWT_EXPIRES_IN`
- `ALLOWED_ORIGINS`
- `INTERNAL_API_SECRET`
- `COOKIE_SECRET`

## 4.5 recomendacion-service

Requeridas:

- `GASOLINERAS_API_URL`

Condicionales:

- `ORS_API_KEY` (si `ROUTING_BACKEND=ors`)

Opcionales:

- `ROUTING_BACKEND`, `ROUTING_FAILOVER_TO_OSRM`, `ALLOW_STRAIGHT_LINE_FALLBACK`
- `OSRM_BASE_URL`, `ORS_BASE_URL`
- `GOBIERNO_API_URL`
- `LOG_LEVEL`

## 4.6 voice-assistant-service (profile ai)

Requeridas para uso OpenAI real:

- `GATEWAY_BASE_URL`
- `OPENAI_API_KEY`

Opcionales:

- `INTERNAL_API_SECRET`
- modelos y limites (`OPENAI_*`, `VOICE_*`)

## 4.7 mcp-gasolineras-server (profile ai)

Requeridas:

- `GATEWAY_BASE_URL`

Opcionales:

- `INTERNAL_API_SECRET`
- `HTTP_TIMEOUT_MS`
- `DEFAULT_USER_BEARER_TOKEN`

## 5) Estado actual del gateway (refactor + OpenAPI)

- El gateway esta refactorizado por modulos:
  - `src/modules/openapi.js`
  - `src/modules/health.js`
  - `src/modules/proxyUsuarios.js`
- Sigue integrando OpenAPI de servicios configurados en `SERVICE_REGISTRY`.
- Tras la integracion EV en gasolineras-service, los endpoints `/api/charging/*` se proxyean a `gasolineras-service`.
- La agregacion OpenAPI preserva rutas `/api/charging/*` cuando vienen desde `gasolineras-service`.
