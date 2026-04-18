# TankGo — Plataforma de Gasolineras

<div align="center">

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js)
![Hono](https://img.shields.io/badge/Hono-4.10-orange)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8)
![GCP](https://img.shields.io/badge/GCP-Cloud_Run-4285F4?logo=googlecloud)

**Encuentra las gasolineras más baratas de España**

[Demo en vivo](https://tankgo.onrender.com) · [Documentación API](https://gateway-gzzi.onrender.com/docs)

</div>

---

## Descripción

TankGo es una plataforma de microservicios para consultar, comparar y visualizar precios de gasolineras en España. Usa datos oficiales del Ministerio de Industria (MinItur) y permite buscar estaciones cercanas, comparar precios, recibir recomendaciones de ruta y hacer predicciones de precios con modelos ML.

---

## Índice

1. [Arquitectura](#1-arquitectura)
2. [Tecnologías](#2-tecnologías)
3. [Servicios y Endpoints Clave](#3-servicios-y-endpoints-clave)
4. [Sistema de Usuarios y Autenticación](#4-sistema-de-usuarios-y-autenticación)
5. [API Gateway — Comportamiento y Routing](#5-api-gateway--comportamiento-y-routing)
6. [Seguridad](#6-seguridad)
7. [Configuración y .env](#7-configuración-y-env)
8. [Instalación con Docker Compose](#8-instalación-con-docker-compose)
9. [Despliegue en Producción (GCP)](#9-despliegue-en-producción-gcp)
10. [Estructura del Proyecto](#10-estructura-del-proyecto)

---

## 1. Arquitectura

**Patrón: API Gateway + Microservicios**

El frontend se comunica únicamente con el Gateway (puerto 8080). El Gateway actúa como proxy reverso hacia los servicios internos, que no son accesibles desde el exterior. Los servicios se comunican entre sí mediante peticiones HTTP con cabecera `X-Internal-Secret`.

```
┌─────────────────────────────────────────────────────┐
│  Frontend React (PWA)  ·  :80                       │
│  i18n: Español / English / Euskera                  │
└─────────────────────┬───────────────────────────────┘
                      │  HTTP  credentials: include
                      ▼
┌─────────────────────────────────────────────────────┐
│  API Gateway (Hono)  ·  :8080                       │
│  Proxy reverso · OpenAPI · OAuth · CORS · WS bridge │
└──┬───────────┬──────────┬─────────────┬─────────────┘
   │           │          │             │
   ▼           ▼          ▼             ▼
Usuarios   Gasolineras  Recomendacion  Voice / MCP
:3001       :8000        :8001          :8090 / stdio
(Fastify)  (FastAPI)   (FastAPI)      (Fastify/Gemini)
   │           │                        ▲
   └─────┬─────┘                 Prediction :8001
         ▼                        (LightGBM, perfil ml)
  PostgreSQL (Neon cloud)
```

**Principios clave:**
- El cliente (browser) solo habla con el Gateway — los servicios internos no se exponen.
- La BD PostgreSQL es compartida (Neon cloud), no hay base de datos local en docker-compose.
- Los perfiles Docker opcionales (`ml`, `ai`) añaden servicios de predicción y voz sin modificar el núcleo.

---

## 2. Tecnologías

### Frontend (`frontend-client`)
| Lib | Versión | Uso |
|-----|---------|-----|
| React | 19 | Framework UI |
| Vite | 8 | Build tool |
| TypeScript | 5 | Tipado |
| TailwindCSS | 4 | Estilos |
| React Router | 7 | Navegación |
| Leaflet + React Leaflet | 1.9 | Mapas interactivos |
| Recharts | 3 | Gráficos de precios |
| Framer Motion | 12 | Animaciones |
| Axios | 1.15 | Cliente HTTP |
| i18next | 25 | Internacionalización (es/en/eu) |
| Workbox + Vite PWA | 7 | Service Worker / PWA |
| @react-oauth/google | — | Login con Google |

### API Gateway (`gateway-hono`)
| Lib | Versión | Uso |
|-----|---------|-----|
| Hono | 4.10 | Framework web ligero |
| Node.js | 20 | Runtime |
| ws | 8.18 | WebSocket bridge (voz) |
| @hono/swagger-ui | — | Docs Swagger |

### Usuarios Service (`usuarios-service`)
| Lib | Versión | Uso |
|-----|---------|-----|
| Fastify | 5.7 | Framework HTTP |
| @fastify/jwt | — | Firma/verificación JWT |
| @fastify/cookie | — | Gestión cookies |
| bcryptjs | 3 | Hash de contraseñas |
| pg | 8 | Driver PostgreSQL |
| @fastify/rate-limit | — | Limitación de peticiones |

### Gasolineras Service (`gasolineras-service`)
| Lib | Versión | Uso |
|-----|---------|-----|
| FastAPI | 0.115 | Framework async Python |
| Uvicorn | 0.34 | Servidor ASGI |
| psycopg2-binary | — | PostgreSQL |
| Pydantic | 2.10 | Validación de datos |
| APScheduler | 3.10 | Sync programado |
| HTTPX | 0.27 | Cliente HTTP async |
| PyArrow | 16 | Export Parquet a GCS |
| google-cloud-storage | — | GCS (ML pipeline) |

### Recomendacion Service (`recomendacion-service`)
| Lib | Versión | Uso |
|-----|---------|-----|
| FastAPI | 0.115 | Framework |
| Shapely | 2.0 | Corredor geométrico de ruta |
| HTTPX | 0.28 | Consultar gasolineras API |
| OpenRouteService (ORS) | — | Routing cloud |
| OSRM | — | Routing auto-hospedado |

### Prediction Service (`prediction-service`, perfil `ml`)
| Lib | Versión | Uso |
|-----|---------|-----|
| FastAPI | 0.115 | API HTTP opcional |
| LightGBM | 4.3 | Regresión cuantílica |
| Pandas / NumPy | 2.2 / 1.26 | Procesamiento datos |
| yfinance | 0.2 | Precio Brent (crudo) |
| scikit-learn | 1.4 | Preprocesado |
| google-cloud-storage | — | Modelos y predicciones |

### Voice Assistant Service (`voice-assistant-service`, perfil `ai`)
| Lib | Versión | Uso |
|-----|---------|-----|
| Fastify | 5.2 | Framework |
| @google/genai | 1.49 | Gemini 2.5 Flash |
| @fastify/websocket | — | Streaming audio en tiempo real |

### MCP Server (`mcp-gasolineras-server`, perfil `ai`)
| Lib | Versión | Uso |
|-----|---------|-----|
| @modelcontextprotocol/sdk | 1.18 | Protocolo MCP (stdio) |
| Zod | 3.23 | Validación de esquemas |

### Bases de Datos y Cloud
| Servicio | Uso |
|----------|-----|
| PostgreSQL (Neon) | Usuarios, gasolineras, historial de precios, predicciones |
| Google Cloud Storage | Snapshots Parquet (ML pipeline), artefactos de modelos |
| Google Cloud Run | Despliegue serverless (producción) |
| Google Cloud Build | CI/CD (7 pipelines independientes) |
| Google Secret Manager | Secretos en producción |

---

## 3. Servicios y Endpoints Clave

### 3.1 Frontend (`:80` / `:5173` dev)

**Features principales:**
- Mapa interactivo con clustering de marcadores (Leaflet)
- Búsqueda por provincia, municipio, marca y tipo de combustible
- Historial de precios con gráfico temporal (Recharts)
- Gestión de favoritos (sincronizada con backend)
- Login tradicional y Google OAuth
- Asistente de voz en tiempo real (WebSocket → Gemini)
- PWA instalable con soporte offline (Workbox)
- Modo oscuro
- i18n completo en 3 idiomas

### 3.2 API Gateway (`:8080`)

Punto de entrada único para el frontend. Ver sección [5. API Gateway](#5-api-gateway--comportamiento-y-routing) para detalle completo.

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Estado agregado de todos los servicios |
| `/docs` | GET | Swagger UI unificado |
| `/openapi.json` | GET | Spec OpenAPI agregada |
| `/api/geocoding/search` | GET | Geocodificación (Nominatim) |
| `/api/geocoding/reverse` | GET | Geocodificación inversa |
| `/api/usuarios/*` | ALL | Proxy → usuarios-service |
| `/api/gasolineras/*` | ALL | Proxy → gasolineras-service |
| `/api/recomendacion/*` | ALL | Proxy → recomendacion-service |
| `/api/charging/*` | ALL | Proxy → gasolineras-service (EV) |
| `/api/prediction/*` | ALL | Proxy → prediction-service (opcional) |
| `/api/voice/*` | ALL/WS | Proxy + bridge WS → voice-assistant (opcional) |

### 3.3 Usuarios Service (`:3001`)

**Features:**
- Registro/login con email y contraseña
- Login con Google OAuth (flujo 3-patas via gateway)
- JWT httpOnly cookie (7 días)
- Perfil de usuario con preferencias de combustible y vehículo
- Gestión de favoritos (CRUD)
- Endpoints internos para comunicación entre servicios
- Admin endpoints (listado de usuarios)

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/usuarios/register` | POST | — | Registro con email+password |
| `/api/usuarios/login` | POST | — | Login → devuelve cookie authToken |
| `/api/usuarios/me` | GET | JWT | Perfil del usuario autenticado |
| `/api/usuarios/me` | PATCH | JWT | Actualizar perfil y preferencias |
| `/api/usuarios/me` | DELETE | JWT | Eliminar cuenta |
| `/api/usuarios/` | GET | JWT+Admin | Listar todos los usuarios |
| `/api/usuarios/google/internal` | POST | Internal Secret | Callback OAuth Google (solo Gateway) |
| `/api/usuarios/favoritos` | GET | JWT | Listar favoritos con detalles |
| `/api/usuarios/favoritos` | POST | JWT | Añadir gasolinera a favoritos |
| `/api/usuarios/favoritos/:ideess` | DELETE | JWT | Eliminar favorito |
| `/api/usuarios/favoritos/reconcile` | POST | JWT | Reconciliar IDs obsoletos |
| `/api/usuarios/favoritos/all-ideess` | GET | Internal Secret | IDs favoritos globales (para ML) |

**Rate limits:** 5 req/15min en `/login` y `/register` (por IP). El resto de rutas no tienen rate limit en usuarios-service (plugin con `global: false`, solo se activa por ruta explícita).

### 3.4 Gasolineras Service (`:8000`)

**Features:**
- Sync automático desde la API del Ministerio de Industria (MinItur)
- Almacenamiento en PostgreSQL con historial de precios
- Búsqueda geoespacial por radio (haversine)
- Estadísticas de precios por provincia/municipio
- Integración de puntos de recarga eléctrica (mapareve.es)
- Export a Parquet en GCS para pipeline ML
- Fallback a memoria si la BD no está disponible

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/gasolineras/` | GET | — | Listado con filtros (provincia, municipio, precio_max, skip, limit≤20000) |
| `/gasolineras/cerca` | GET | — | Cercanas (lat, lon, km≤200, limit) |
| `/gasolineras/{id}` | GET | — | Detalle de estación |
| `/gasolineras/{id}/cercanas` | GET | — | Estaciones cercanas a otra (radio_km=5) |
| `/gasolineras/{id}/historial` | GET | — | Historial de precios (dias=1..365, default 30) |
| `/gasolineras/markers` | POST | — | Marcadores para viewport del mapa (clusters en zoom bajo) |
| `/gasolineras/estadisticas` | GET | — | Stats de precios por zona |
| `/gasolineras/count` | GET | — | Total de estaciones |
| `/gasolineras/snapshot` | GET | — | Estado y fecha del último sync |
| `/gasolineras/sync` | POST | **Internal Secret** | Fuerza sync desde API de Gobierno |
| `/gasolineras/ensure-fresh` | POST | **Internal Secret** | Sync condicional (solo si los datos están desactualizados) |
| `/gasolineras/daily-sync-export` | POST | **Internal Secret** | Sync + export Parquet a GCS (recomendado para cron diario) |
| `/api/charging/markers` | POST | — | Marcadores de cargadores EV |
| `/api/charging/details/{id}` | GET | — | Detalle de cargador (cache 5 min) |

**Sync de datos:** Al arrancar (si `AUTO_ENSURE_FRESH_ON_STARTUP=true`), el servicio comprueba si los datos están frescos. Si no lo están, sincroniza automáticamente desde el Ministerio. En producción hay un cron job que llama a `/daily-sync-export` una vez al día.

### 3.5 Recomendacion Service (`:8001` interno · `:8002` host)

**Features:**
- Calcula las mejores gasolineras en una ruta A→B
- Routing real con **OpenRouteService (ORS)** como backend por defecto (requiere API key)
- Backend alternativo: **OSRM** (auto-hospedado o demo, configurable con `ROUTING_BACKEND=osrm`)
- Filtra gasolineras dentro de un corredor geométrico alrededor de la ruta (Shapely)
- Score ponderado: precio + desvío + ahorro estimado
- Fallback a distancia en línea recta si el routing falla (`ALLOW_STRAIGHT_LINE_FALLBACK`)

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/recomendacion/ruta` | POST | — | Recomendar gasolineras para una ruta |
| `/recomendacion/cercanas` | GET | — | Cercanas con precios |
| `/recomendacion/combustibles` | GET | — | Tipos de combustible disponibles |

**Ejemplo de body para `/recomendacion/ruta`:**
```json
{
  "origen": { "lat": 40.4, "lon": -3.7, "nombre": "Madrid" },
  "destino": { "lat": 41.3, "lon": 2.1, "nombre": "Barcelona" },
  "combustible": "gasolina_95",
  "max_desvio_km": 5,
  "litros_deposito": 50,
  "evitar_peajes": false,
  "peso_precio": 0.6,
  "peso_desvio": 0.4,
  "top_n": 5
}
```

> `litros_deposito` es opcional (0-200 L). Si se envía, el servicio calcula el campo `ahorro_vs_mas_cara_eur` en la respuesta. El frontend lo envía actualmente con valor fijo de 50 L (no es un input configurable por el usuario todavía).

### 3.6 Prediction Service (`:8001`, perfil `ml`)

**Features:**
- Modelos LightGBM de regresión cuantílica por gasolinera
- Correlación con precio del Brent (yfinance)
- Pipeline: GCS (Parquet raw) → entrenamiento → predicción → GCS (resultados)
- Selección de estaciones basada en favoritos globales de usuarios

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Estado del servicio |
| `/api/prediction/station/{ideess}` | GET | Predicción de precio para una estación |

### 3.7 Voice Assistant Service (`:8090`, perfil `ai`)

**Features:**
- Pipeline **STT → LLM con tool calling → TTS**, todo con Gemini 2.5 Flash
- Accesible tanto vía HTTP (petición única) como WebSocket (streaming)
- Rate limiting: 40 req/min por IP
- Audio de entrada en base64 (máx 5.5 MB), respuesta con audio TTS opcional
- Contexto de gasolineras y precios integrado (tool calling hacia la API)

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/health` | GET | — | Estado |
| `/voice/dialog` | POST | JWT | Diálogo: envía texto o audio base64, recibe respuesta texto+audio |
| `/ws/voice` | WS | JWT | Stream de audio en tiempo real (acciones: `dialog`, `audio_chunk`, `ping`) |

El Gateway expone `/api/voice/ws` como bridge WebSocket hacia este servicio.

### 3.8 MCP Server (stdio, perfil `ai`)

Servidor MCP (Model Context Protocol) para integración con LLMs (Claude). Transporte stdio, no expone puerto HTTP.

**Herramientas disponibles:**
- `search_nearby_stations` — Gasolineras cercanas a coordenadas
- `get_station_details` — Detalle de estación por ID
- `get_user_favorites` — Favoritos del usuario
- `recommend_route` — Recomendación para ruta A→B
- `get_fuel_prices` — Precios actuales de combustible

---

## 4. Sistema de Usuarios y Autenticación

### Flujo Login Tradicional

```
Frontend                 Gateway              Usuarios Service         DB
   │                        │                       │                   │
   │  POST /api/usuarios/login {email,password}      │                   │
   │───────────────────────>│                       │                   │
   │                        │  Proxy request        │                   │
   │                        │──────────────────────>│                   │
   │                        │                       │  SELECT user      │
   │                        │                       │──────────────────>│
   │                        │                       │<──────────────────│
   │                        │                       │  bcrypt.compare() │
   │                        │                       │  sign JWT (7d)    │
   │                        │  {token, user}        │                   │
   │                        │<──────────────────────│                   │
   │  Set-Cookie: authToken=<JWT>; httpOnly          │                   │
   │<───────────────────────│                       │                   │
   │  (Cookie guardada en browser, no accesible por JS)                 │
```

### Flujo Google OAuth

```
Frontend                 Gateway              Usuarios Service
   │                        │                       │
   │  Google popup login    │                       │
   │  → recibe id_token     │                       │
   │                        │                       │
   │  POST /api/auth/google/verify {id_token}        │
   │───────────────────────>│                       │
   │                        │  POST /api/usuarios/google/internal        │
   │                        │  {google_id, email, nombre}                │
   │                        │  X-Internal-Secret: <secret>               │
   │                        │──────────────────────>│
   │                        │                       │  UPSERT usuario
   │                        │                       │  sign JWT
   │                        │  {token, user}        │
   │                        │<──────────────────────│
   │  Set-Cookie: authToken=<JWT>; httpOnly          │
   │<───────────────────────│                       │
```

### Peticiones Autenticadas

El browser envía la cookie automáticamente gracias a `credentials: 'include'` en el cliente Axios. También se acepta `Authorization: Bearer <token>` para clientes API.

```
Browser  →  Gateway  →  Servicio
           extrae token de cookie o header Authorization
           verifica firma con JWT_SECRET
           si ok: pasa request con user payload
           si ko: 401 Unauthorized
```

### Estructura del JWT

```json
{
  "id": "uuid-del-usuario",
  "email": "usuario@example.com",
  "nombre": "Iker",
  "is_admin": false,
  "combustible_favorito": "Precio Gasolina 95 E5",
  "iat": 1704067200,
  "exp": 1704672000
}
```

- **Algoritmo:** HS256
- **Expiración:** 7 días (configurable con `JWT_EXPIRES_IN`)
- **Secret:** variable `JWT_SECRET` (mínimo 32 caracteres)
- **Almacenamiento:** httpOnly cookie — nunca en localStorage

---

## 5. API Gateway — Comportamiento y Routing

### Responsabilidades

| Función | Detalle |
|---------|---------|
| **Proxy reverso** | Reenvía peticiones a los servicios internos de Docker |
| **Cookie management** | Recibe token del servicio, lo setea como httpOnly cookie |
| **OAuth handler** | Gestiona el flujo Google OAuth, llama a usuarios via internal secret |
| **OpenAPI agregación** | Agrega specs de todos los servicios en `/openapi.json` (refresh cada 5 min) |
| **Health aggregation** | `GET /health` comprueba todos los servicios y devuelve estado global |
| **CORS** | Permite solo orígenes configurados en `ALLOWED_ORIGINS` / `FRONTEND_URLS` |
| **WebSocket bridge** | Hace de puente WS entre el frontend y el voice-assistant-service |
| **Geocoding proxy** | Proxea llamadas a Nominatim (OpenStreetMap) evitando CORS del browser |
| **Cloud Run IAM** | En producción, añade token IAM en cabeceras para comunicarse con otros Cloud Run |

### Routing de servicios

```
/api/usuarios/*       → http://usuarios:3001
/api/gasolineras/*    → http://gasolineras:8000
/api/recomendacion/*  → http://recomendacion:8001
/api/charging/*       → http://gasolineras:8000  (mismo servicio, router EV)
/api/prediction/*     → http://prediccion:8001   (opcional, perfil ml)
/api/voice/*          → http://voice-assistant:8090 (opcional, perfil ai)
/api/geocoding/*      → https://nominatim.openstreetmap.org
```

### Gestión del token (cookie)

```javascript
// Cuando usuarios-service devuelve un token tras login:
gateway.setcookie("authToken", token, {
  httpOnly: true,
  secure: true,              // solo en HTTPS (producción)
  sameSite: "None",          // necesario para cross-origin en prod
  path: "/",
  maxAge: 7 * 24 * 60 * 60  // 7 días en segundos
});

// En desarrollo (local):
sameSite: "Lax"
secure: false
```

### Health check

`GET /health` devuelve el estado de todos los servicios. Si un servicio optional no está configurado aparece como `NOT_CONFIGURED`. El estado global es `UP` solo si los servicios **requeridos** están UP.

```json
{
  "status": "UP",
  "services": {
    "usuarios": { "status": "UP", "url": "http://usuarios:3001" },
    "gasolineras": { "status": "UP", "url": "http://gasolineras:8000" },
    "recomendacion": { "status": "UP" },
    "voice_assistant": { "status": "NOT_CONFIGURED" },
    "prediction": { "status": "NOT_CONFIGURED" }
  }
}
```

---

## 6. Seguridad

### Autenticación y tokens

| Mecanismo | Implementación |
|-----------|---------------|
| Hash de contraseñas | bcryptjs, 12 rondas de salt |
| Firma de token | JWT HS256 con `JWT_SECRET` |
| Almacenamiento de token | httpOnly cookie (inaccesible para JS) |
| Transporte seguro | Secure flag + HTTPS en producción |
| CSRF | SameSite=None + Secure en prod; SameSite=Lax en dev |
| Comunicación interna | Cabecera `X-Internal-Secret` entre servicios |

### CORS

El Gateway solo permite peticiones de orígenes en la lista blanca. En desarrollo, `http://localhost:5173` y `http://localhost:80`. En producción, los dominios en `FRONTEND_URLS`.

```
Access-Control-Allow-Origin: <origen de la whitelist>
Access-Control-Allow-Credentials: true
```

### Rate Limiting

| Endpoint | Límite |
|----------|--------|
| `/api/usuarios/login` | 5 req / 15 min por IP |
| `/api/usuarios/register` | 5 req / 15 min por IP |
| Resto de rutas usuarios-service | Sin límite (plugin con `global: false`, opt-in por ruta) |
| Voice assistant | 40 req / min por IP |

Los localhost (`127.0.0.1`, `::1`) están exentos de rate limiting.

### Protección de endpoints internos

Los endpoints de administración y sincronización requieren la cabecera `X-Internal-Secret` con el valor configurado en `INTERNAL_API_SECRET`. Sin ella, el servidor devuelve `403 Forbidden`.

```bash
# Ejemplo: forzar sync de gasolineras
curl -X POST http://localhost:8000/gasolineras/sync \
  -H "X-Internal-Secret: tu-secreto-interno"
```

### Validación de datos

- **Pydantic v2** en todos los servicios FastAPI — rechaza payloads malformados antes de procesarlos.
- **Query parameter limits** — `limit ≤ 20000` en gasolineras, `km ≤ 200` en búsqueda por radio.
- **Body size limits** — 5.5 MB para audio en voz, ~10 MB en el resto.
- **Queries parametrizadas** — psycopg2 y pg nunca construyen SQL con concatenación.

### Cabeceras de seguridad

- **Helmet.js** en usuarios-service: X-Frame-Options, CSP, X-Content-Type-Options.
- **HTTPS automático** en Cloud Run (producción).
- **Secretos nunca en el repo** — `.env` en `.gitignore`, Google Secret Manager en CI/CD.

---

## 7. Configuración y .env

### Variables mínimas requeridas

```env
# Base de datos PostgreSQL (obligatorio)
DATABASE_URL=postgresql://usuario:password@host/db?sslmode=require

# JWT (obligatorio, mínimo 32 caracteres)
JWT_SECRET=genera-un-secreto-seguro-de-32-caracteres

# Comunicación interna entre servicios (obligatorio)
INTERNAL_API_SECRET=otro-secreto-interno-seguro
```

> Para generar `JWT_SECRET` en Windows: `.\generate-jwt-secret.ps1`

### Variables completas (`.env.example`)

```env
# ── Entorno ──────────────────────────────────────────────────
ENVIRONMENT=local
NODE_ENV=development
LOG_LEVEL=INFO

# ── Base de datos ─────────────────────────────────────────────
DATABASE_URL=postgresql://...neon.tech/dbname?sslmode=require

# ── Puertos ───────────────────────────────────────────────────
FRONTEND_PORT=80
GATEWAY_PORT=8080
USUARIOS_PORT=3001
GASOLINERAS_PORT=8000
RECOMENDACION_PORT=8002
VOICE_ASSISTANT_PORT=8090

# ── URLs internas (red Docker) ────────────────────────────────
USUARIOS_SERVICE_URL=http://usuarios:3001
GASOLINERAS_SERVICE_URL=http://gasolineras:8000
RECOMENDACION_SERVICE_URL=http://recomendacion:8001
VOICE_ASSISTANT_SERVICE_URL=http://voice-assistant:8090
PREDICTION_SERVICE_URL=            # opcional

# ── Autenticación ─────────────────────────────────────────────
JWT_SECRET=                        # OBLIGATORIO
JWT_EXPIRES_IN=7d
COOKIE_SECRET=                     # igual que JWT_SECRET o aleatorio
INTERNAL_API_SECRET=               # OBLIGATORIO

# ── Google OAuth (opcional) ───────────────────────────────────
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3001/api/usuarios/google/callback

# ── CORS ──────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:80
FRONTEND_URLS=                     # producción: dominios separados por coma
GATEWAY_URL=http://localhost:8080
ALLOWED_ORIGINS=http://localhost:80,http://localhost:5173

# ── Gasolineras ───────────────────────────────────────────────
GOBIERNO_API_URL=https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/
AUTO_ENSURE_FRESH_ON_STARTUP=true
AUTO_SYNC_ON_READ=false
AUTO_SYNC_COOLDOWN_MINUTES=30
RAW_EXPORT_ENABLED=false
RAW_EXPORT_GCS_BUCKET=            # opcional, para pipeline ML

# ── Recomendacion ─────────────────────────────────────────────
ROUTING_BACKEND=ors               # ors | osrm
ORS_API_KEY=                      # necesario si ROUTING_BACKEND=ors
OSRM_BASE_URL=http://router.project-osrm.org
ALLOW_STRAIGHT_LINE_FALLBACK=false
GASOLINERAS_API_URL=http://gateway:8080/api/gasolineras/?limit=20000

# ── Voice Assistant (perfil ai) ───────────────────────────────
GEMINI_API_KEY=                   # Google AI Studio API key
GEMINI_LIVE_MODEL=models/gemini-2.5-flash-native-audio-latest
GEMINI_VOICE_NAME=Aoede
GEMINI_LANGUAGE=es-ES
VOICE_RATE_LIMIT_MAX_REQUESTS=40

# ── Prediction (perfil ml) ────────────────────────────────────
RUN_HTTP_API=false
SOURCE_MODE=favorites
TOP_N_STATIONS=500
ENABLE_GCS_BACKUP=false
GCS_BUCKET=

# ── Gateway ───────────────────────────────────────────────────
OPENAPI_REFRESH_MS=300000
HEALTH_TIMEOUT_MS=12000
GASOLINERAS_AUTO_ENSURE_FRESH_ENABLED=true
GASOLINERAS_AUTO_ENSURE_INTERVAL_MINUTES=60

# ── Frontend (se compilan dentro de la imagen Docker) ─────────
VITE_API_BASE_URL=http://localhost:8080
VITE_GOOGLE_CLIENT_ID=
VITE_VOICE_WS_ENABLED=false
VITE_VOICE_WS_URL=ws://localhost:8080/api/voice/ws
```

---

## 8. Instalación con Docker Compose

### Requisitos

| Software | Versión | Notas |
|----------|---------|-------|
| Docker Desktop | 20.10+ | Incluye Docker Compose |
| Git | 2.0+ | |

> No se necesita Node.js, Python ni ninguna dependencia adicional en el host.

> **Base de datos:** El `docker-compose.yml` **no levanta PostgreSQL localmente**. Necesitas una base de datos PostgreSQL externa (por ejemplo, [Neon](https://neon.tech) tiene tier gratuito). Configura la URL en `DATABASE_URL`.

### Pasos

#### 1. Clonar el repositorio

```bash
git clone https://github.com/ikeralvis/gasolineras_project.git
cd gasolineras_project
```

#### 2. Configurar variables de entorno

```bash
# Linux/Mac
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Editar `.env` y configurar como mínimo:
- `DATABASE_URL` — cadena de conexión PostgreSQL
- `JWT_SECRET` — secreto de 32+ caracteres
- `INTERNAL_API_SECRET` — secreto para comunicación interna

#### 3. Levantar los servicios

```bash
# Servicios principales (frontend, gateway, usuarios, gasolineras, recomendacion)
docker-compose up -d --build

# Con predicciones ML (añade servicio prediccion)
docker-compose up -d --build --profile ml

# Con IA/voz (añade voice-assistant y mcp-gasolineras)
docker-compose up -d --build --profile ai

# Con todo
docker-compose up -d --build --profile ml --profile ai
```

#### 4. Verificar estado

```bash
docker-compose ps
```

Todos los servicios deben aparecer como `healthy` o `running`. El orden de arranque es:

1. `usuarios` y `gasolineras` arrancan primero (conectan a BD)
2. `gateway` espera a que ambos estén healthy
3. `recomendacion` espera a que gateway esté started
4. `frontend` espera a que gateway esté healthy
5. Perfiles opcionales arrancan cuando gateway está healthy

#### 5. Acceder

| URL | Descripción |
|-----|-------------|
| http://localhost | Aplicación web |
| http://localhost:8080/docs | API Swagger unificado |
| http://localhost:8080/health | Estado de servicios |

> **Puertos en local:** Cada servicio expone su propio puerto en el host, sin conflictos. El frontend usa el gateway (`:8080`) como única API. Los servicios internos están en la red Docker (`usuarios:3001`, `gasolineras:8000`, `recomendacion:8001`); sus puertos en el host (3001, 8000, 8002) solo son para debugging directo.
>
> | Servicio | Puerto host (acceso dev) | Puerto interno Docker |
> |----------|--------------------------|-----------------------|
> | Gateway | 8080 | 8080 |
> | Usuarios | 3001 | 3001 |
> | Gasolineras | 8000 | 8000 |
> | Recomendacion | **8002** | 8001 |
> | Prediction (ml) | **8003** | 8001 |
> | Voice (ai) | 8090 | 8090 |
> | Frontend | 80 | 8080 |
>
> Recomendacion y Prediction comparten el puerto **interno** 8001 pero se mapean a puertos de host distintos (8002/8003), por lo que no hay conflicto. El gateway los accede por nombre Docker (`http://recomendacion:8001`), no por puerto de host.

### Comandos útiles

```bash
# Ver logs de un servicio
docker-compose logs -f gateway
docker-compose logs -f gasolineras

# Reiniciar un servicio
docker-compose restart usuarios

# Reconstruir un servicio
docker-compose up -d --build gateway

# Parar todo (mantiene volúmenes)
docker-compose down

# Parar y borrar volúmenes (pierde datos locales)
docker-compose down -v
```

---

## 9. Despliegue en Producción (GCP)

### Infraestructura

| Componente | Servicio GCP |
|------------|-------------|
| Servicios backend/frontend | Cloud Run (serverless, europe-west1) |
| Imágenes Docker | Artifact Registry (europe-west1) |
| Base de datos | PostgreSQL en Neon (externo) |
| Datos ML | Google Cloud Storage |
| Secretos | Google Secret Manager |
| CI/CD | Cloud Build (7 pipelines independientes) |

### Pipeline CI/CD

Hay un `cloudbuild-*.yaml` por cada servicio. El proceso es:

```
1. Build imagen Docker
2. Push a Artifact Registry (europe-west1-docker.pkg.dev/$PROJECT_ID/tankgo/...)
3. Deploy en Cloud Run con variables de entorno desde Secret Manager
```

El frontend tiene validaciones estrictas en el build:
- `VITE_API_BASE_URL` debe ser `https://` (no localhost)
- `VITE_VOICE_WS_URL` debe apuntar a `/api/voice/ws` del gateway (no al servicio directo)
- `VITE_GOOGLE_CLIENT_ID` se obtiene de Secret Manager

### Configuración de producción

En producción hay que ajustar en `.env` / secretos de Cloud Run:
- `ENVIRONMENT=production`
- `FRONTEND_URLS=https://tu-dominio.com` (CORS)
- `COOKIE_DOMAIN=.tu-dominio.com`
- `USE_TLS=true`
- Habilitar `Secure` flag en cookies (automático cuando `ENVIRONMENT=production`)

---

## 10. Estructura del Proyecto

```
gasolineras_project/
├── frontend-client/              # React 19 SPA + PWA
│   ├── src/
│   │   ├── api/                  # Axios client + interceptores
│   │   ├── components/           # Componentes reutilizables
│   │   ├── pages/                # Vistas (home, search, detail, favorites, profile)
│   │   ├── contexts/             # AuthContext, ThemeContext
│   │   ├── services/             # authService, favoriteService
│   │   └── i18n/locales/         # es.json, en.json, eu.json
│   ├── public/                   # Assets, manifest.json
│   └── vite.config.ts
│
├── gateway-hono/                 # API Gateway
│   └── src/
│       ├── index.js              # Entry point, rutas y proxy
│       ├── config.js             # Variables de entorno
│       └── modules/
│           ├── openapi.js        # Agregación OpenAPI
│           ├── health.js         # Health checks
│           ├── proxyUsuarios.js  # Proxy auth + cookie
│           └── cloudRunAuthFetch.js  # IAM tokens GCP
│
├── usuarios-service/             # Auth + favoritos (Fastify)
│   └── src/
│       ├── routes/               # auth.js, favorites.js, health.js
│       ├── services/             # authService, userService, favoriteService
│       ├── repositories/         # userRepository, favoriteRepository
│       ├── hooks/                # authHooks.js (verifyJwt, adminOnly)
│       └── config/env.js
│
├── gasolineras-service/          # Datos gasolineras (FastAPI)
│   └── app/
│       ├── main.py               # Entry point FastAPI
│       ├── routes/
│       │   ├── gasolineras.py    # Endpoints principales
│       │   └── ev_integration.py # Endpoints carga eléctrica
│       ├── services/             # sync, export, gasolinera_service
│       ├── models/               # Pydantic schemas
│       ├── db/                   # Conexión PostgreSQL
│       └── config.py
│
├── recomendacion-service/        # Recomendación de ruta (FastAPI)
│   └── app/
│       ├── main.py
│       ├── routes/recomendacion.py
│       └── services/
│           ├── recommender.py    # Lógica de scoring
│           ├── routing.py        # ORS / OSRM
│           └── geo_math.py       # Haversine, Shapely
│
├── prediction-service/           # Predicción ML (LightGBM, perfil ml)
│   └── main.py
│
├── voice-assistant-service/      # Asistente de voz Gemini (perfil ai)
│   └── src/
│       ├── server.js
│       └── adapters/pipelineDialog.js
│
├── mcp-gasolineras-server/       # MCP server para LLMs (perfil ai)
│   └── src/index.js
│
├── docs/                         # Documentación adicional
├── docker-compose.yml            # Orquestación local
├── .env.example                  # Plantilla de configuración
├── generate-jwt-secret.ps1       # Script para generar JWT_SECRET
├── cloudbuild-frontend.yaml      # CI/CD Frontend
├── cloudbuild-gateway.yaml       # CI/CD Gateway
├── cloudbuild-usuarios.yaml      # CI/CD Usuarios
├── cloudbuild-gasolineras.yaml   # CI/CD Gasolineras
├── cloudbuild-recomendacion.yaml # CI/CD Recomendacion
├── cloudbuild-prediccion.yaml    # CI/CD Prediction
└── cloudbuild-voice.yaml         # CI/CD Voice Assistant
```

---

## Testing

```bash
# Frontend (Vitest)
cd frontend-client && pnpm test

# Usuarios (Jest + supertest)
cd usuarios-service && npm test

# Gasolineras (pytest)
cd gasolineras-service && pytest

# Recomendacion (pytest)
cd recomendacion-service && pytest
```

Ver [docs/TESTING_CI_GUIDE.md](./docs/TESTING_CI_GUIDE.md) para guía completa.

---

## Licencia

MIT © [Iker Alvis](https://github.com/ikeralvis)

---

<div align="center">

Desarrollado con ❤️ — TankGo · PFG 2025/2026

[Volver arriba](#tankgo--plataforma-de-gasolineras)

</div>
