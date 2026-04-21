# Recomendación de Gasolineras – Servicio independiente

Dado un punto **A** (origen) y un punto **B** (destino), calcula la ruta y recomienda las mejores gasolineras donde repostar, equilibrando **precio** y **desvío**.

---

## Análisis tecnológico

### ¿Qué motor de routing usar?

| Motor | Precio | Hosting | API key | Uso recomendado |
|---|---|---|---|---|
| **OSRM** | Gratis | Demo público o self-hosted (Docker) | No | ✅ **Producción self-hosted**, desarrollo sin key |
| **OpenRouteService (ORS)** | Gratis hasta 2 000 req/día | Nube (hosted) | Sí (gratis) | ✅ **SaaS rápido**, sin infraestructura |
| **Valhalla** | Gratis | Self-hosted | No | Necesitas isocronas o enrutamiento peatonal |
| **GraphHopper** | Gratis con créditos | Nube o self-hosted | Sí (gratis) | Alternativa a ORS si necesitas más flexibilidad |

**Arquitectura recomendada**: este servicio implementa routing directamente (ORS/OSRM) y expone `/routing/*`. El gateway solo actúa como proxy para mantener un punto de entrada único.

---

### Lógica A→B y A→parada→B

El desvío final se calcula así:

```
desvío_km = dist(A → gasolinera) + dist(gasolinera → B) − dist(A → B)
```

Pipeline actual en producción:
- Pre-filtro geométrico rápido (Shapely) para reducir candidatas.
- Estimación inicial (haversine + factor vial) para ordenar.
- Refinado de tiempo con **ORS Matrix** para candidatas prometedoras.
- Refinado exacto con ruta real **A→S→B** para el pool final (delta de duración real).

Así, el valor de `desvio_min_estimado` en el top final no depende de velocidad fija, sino de duración real de ORS.

Para el usuario final, el resultado práctico es:
- **desvío_km = 0** → la gasolinera está casi en la ruta, no desvías nada.
- **desvío_km = 3** → tendrás que salir 1.5 km de la autovía y volver.
- **desvío_km > max_desvio_km** → se descarta automáticamente.

---

### ¿Por qué no se hace routing exacto para miles de estaciones?

- España tiene ~11 000 gasolineras. Lanzar una ruta exacta por cada una es inviable por latencia y cuota.
- Se usa una estrategia por fases: aproximación barata -> matrix -> exacto A→S→B en candidatas finalistas.
- Esto mantiene costes/control de cuota sin renunciar a precisión en el resultado mostrado al usuario.

Nota: ORS no usa tráfico en tiempo real como Google Maps, por lo que puede haber diferencias en minutos en horas punta.

---

### Algoritmo de puntuación

```
score = peso_precio × (1 − precio_norm) + peso_desvio × (1 − desvio_norm)
```

Donde `precio_norm` y `desvio_norm` son normalizaciones min-max dentro del conjunto de candidatos. Score en `[0, 1]`; **mayor es mejor**.

Pesos por defecto: `peso_precio = 0.6`, `peso_desvio = 0.4`. Configurables por petición.

---

### ¿Se puede consumir desde un frontend? Sí, REST puro.

```typescript
// Ejemplo desde React/TypeScript
const res = await fetch("/api/recomendacion/ruta", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    origen:  { lat: 40.4168, lon: -3.7038, nombre: "Madrid" },
    destino: { lat: 41.3851, lon:  2.1734, nombre: "Barcelona" },
    posicion_actual: { lat: 40.4168, lon: -3.7038 }, // opcional
    combustible: "gasolina_95",
    max_desvio_km: 5,
    max_detour_minutes: 5,
    evitar_peajes: true,
    litros_deposito: 50,
  }),
});
const data = await res.json();
// data.recomendaciones[0].precio_litro, .desvio_km, .score, .ahorro_vs_mas_cara_eur ...
```

---

### ¿Se puede usar como herramienta de un asistente conversacional (LLM)?

Sí. El servicio devuelve JSON limpio. Un agente (LangChain, OpenAI function calling, etc.) puede declararlo como tool:

```json
{
  "name": "recomendar_gasolinera",
  "description": "Dada una ruta A→B, recomienda gasolineras óptimas por precio y desvío",
  "parameters": {
    "origen_lat": ..., "origen_lon": ...,
    "destino_lat": ..., "destino_lon": ...,
    "combustible": "gasolina_95",
    "max_desvio_km": 5
  }
}
```

---

## Instalación y uso

### Con Docker Compose (dentro del proyecto)

```bash
docker-compose up recomendacion
```

Disponible en `http://localhost:8002` (o el puerto que configures en `.env`).
A través del gateway: `http://localhost:8080/api/recomendacion/ruta`.

### Standalone (fuera del proyecto)

```bash
cd recomendacion-service
pip install -r requirements.txt
GASOLINERAS_API_URL="https://tu-api-externa.com/gasolineras/?limit=2000" \
  uvicorn app.main:app --port 8001
```

También puede consumir directamente la API del Ministerio español (fallback automático si `GASOLINERAS_API_URL` no responde).

---

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `ROUTING_BACKEND` | `ors` | `osrm` o `ors` |
| `ORS_BASE_URL` | `https://api.openrouteservice.org` | URL base de ORS |
| `OSRM_BASE_URL` | `http://router.project-osrm.org` | URL de tu OSRM (demo o self-hosted) |
| `ORS_API_KEY` | *(vacío)* | API key de OpenRouteService (si usas `ors`) |
| `GASOLINERAS_API_URL` | `http://gasolineras:8000/gasolineras/?limit=2000` | Endpoint de gasolineras |
| `ROUTE_CANDIDATES_SOURCE` | `auto` | `api`, `postgis` o `auto` para candidatas de ruta |
| `DATABASE_URL` | *(vacío)* | Requerida si `ROUTE_CANDIDATES_SOURCE=postgis` |
| `MAX_REAL_DETOUR_CHECKS` | `30` | Máximo de rutas A→S→B exactas para refinar desvíos |
| `DEFAULT_MAX_DESVIO_KM` | `5.0` | Desvío máximo por defecto |
| `DEFAULT_WEIGHT_PRICE` | `0.6` | Peso del precio en el score |
| `DEFAULT_WEIGHT_DETOUR` | `0.4` | Peso del desvío en el score |

---

## Endpoints

### `POST /recomendacion/ruta`

Recomienda gasolineras en una ruta A→B.

**Body:**
```json
{
  "origen":  { "lat": 40.4168, "lon": -3.7038, "nombre": "Madrid" },
  "destino": { "lat": 41.3851, "lon":  2.1734, "nombre": "Barcelona" },
  "posicion_actual": { "lat": 40.4168, "lon": -3.7038 },
  "combustible": "gasolina_95",
  "max_desvio_km": 5,
  "max_detour_minutes": 5,
  "top_n": 5,
  "peso_precio": 0.6,
  "peso_desvio": 0.4,
  "litros_deposito": 50,
  "evitar_peajes": true
}
```

Además de `ruta_base.coordinates`, la respuesta incluye `geojson` (`FeatureCollection`) lista para pintar ruta y puntos en el mapa.

**Respuesta:**
```json
{
  "ruta_base": { "distancia_km": 621.5, "duracion_min": 358.0, ... },
  "estadisticas": {
    "candidatos_evaluados": 34,
    "precio_min": 1.429,
    "precio_max": 1.569,
    "precio_medio": 1.489,
    "combustible": "gasolina_95"
  },
  "recomendaciones": [
    {
      "posicion": 1,
      "gasolinera": { "nombre": "REPSOL", "municipio": "ZARAGOZA", ... },
      "precio_litro": 1.439,
      "desvio_km": 0.8,
      "desvio_min_estimado": 0.6,
      "distancia_desde_origen_km": 310.2,
      "porcentaje_ruta": 49.9,
      "score": 0.8721,
      "ahorro_vs_mas_cara_eur": 6.50,
      "diferencia_vs_mas_barata_eur_litro": 0.010
    }
  ],
  "metadata": {
    "routing_backend": "osrm",
    "procesado_en_ms": 420
  }
}
```

### `GET /recomendacion/cercanas`

Gasolineras cercanas a un punto.

```
GET /recomendacion/cercanas?lat=40.4168&lon=-3.7038&radio_km=10&combustible=gasolina_95
```

### `GET /recomendacion/combustibles`

Lista los tipos de combustible disponibles.

### `POST /routing/directions`

Calcula ruta para una lista de coordenadas `[lon, lat]` usando ORS u OSRM.

### `POST /routing/matrix`

Calcula matriz de duraciones para indices de `sources` y `destinations` (soportado en ORS).

### `GET /health`

Estado del servicio.

### `GET /docs`

Documentación Swagger interactiva.

---

## Auto-hosting de OSRM para España (recomendado en producción)

```bash
# Descargar datos OSM de España (~1.5 GB)
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract \
  -p /opt/car.lua /data/spain-latest.osm.pbf

docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/spain-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/spain-latest.osrm

# Levantar servidor OSRM local
docker run -t -i -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend osrm-routed \
  --algorithm mld /data/spain-latest.osrm
```

Luego: `OSRM_BASE_URL=http://localhost:5000` en tu `.env`.

Ventajas: sin límites de peticiones, latencia < 100 ms, sin depender de servicios externos.

---

## Contrato Frontend Recomendado (JSON)

El backend ahora acepta nombres en español e inglés para transición sin breaking changes.

```json
{
  "origin": { "lat": 40.4168, "lon": -3.7038, "name": "Madrid" },
  "destination": { "lat": 41.3851, "lon": 2.1734, "name": "Barcelona" },
  "current_position": { "lat": 40.4168, "lon": -3.7038 },
  "combustible": "gasolina_95",
  "max_detour_time": 5,
  "max_desvio_km": 8,
  "top_n": 20,
  "peso_precio": 0.6,
  "peso_desvio": 0.4,
  "litros_deposito": 50,
  "avoid_tolls": true
}
```

Campos equivalentes aceptados por compatibilidad:
- `origin` <-> `origen`
- `destination` <-> `destino`
- `current_position` <-> `posicion_actual`
- `max_detour_time`/`max_detour_minutes` <-> `max_desvio_min`
- `avoid_tolls` <-> `evitar_peajes`

---

## Viabilidad: carretera vs pueblo (OSM vs Mapbox vs Google)

### Resultado práctico

- **OSM/ORS/OSRM sí permite estimar** si una estación está en eje de viaje o exige desvío, gracias al cálculo `A->S->B - A->B` en minutos.
- **OSM por sí solo no siempre clasifica semánticamente** "área de servicio de autopista" vs "estación urbana" con precisión uniforme.
- Por eso el servicio incorpora enriquecimiento opcional con proveedores externos:
  - `POI_ACCESS_PROVIDER=mapbox`
  - `POI_ACCESS_PROVIDER=google`
  - `POI_ACCESS_PROVIDER=auto` (elige Google/Mapbox si hay API key, si no OSM heurístico).

### Calidad esperada por proveedor

| Proveedor | Fortaleza | Limitación | Recomendación |
|---|---|---|---|
| OSM | Sin coste variable, reproducible, sin lock-in | Etiquetado irregular según zona | Base por defecto |
| Mapbox Search | Mejor normalización de POI y contexto comercial | No garantiza etiqueta explícita de "service area" en todos los casos | Buen complemento |
| Google Places | Cobertura alta y tipologías útiles (`rest_stop`, etc.) | Coste por uso y cuota | Mejor opción para clasificación premium |

### Decisión sugerida

- Mantener OSM para routing principal (ORS/OSRM) y desvío en tiempo.
- Activar Google Places o Mapbox solo para enriquecer el top de candidatas (`ACCESS_ENRICHMENT_TOP_N`) y no disparar costes.

---

## GCP Cloud Run + Secret Manager (Esquema)

### 1) Secretos recomendados

- `ors-api-key`
- `mapbox-access-token`
- `google-places-api-key`

### 2) Crear secretos

```bash
echo -n "TU_ORS_KEY" | gcloud secrets create ors-api-key --data-file=-
echo -n "TU_MAPBOX_TOKEN" | gcloud secrets create mapbox-access-token --data-file=-
echo -n "TU_GOOGLE_PLACES_KEY" | gcloud secrets create google-places-api-key --data-file=-
```

### 3) Dar acceso al runtime service account

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/secretmanager.secretAccessor"
```

### 4) Deploy Cloud Run con secretos y env vars

```bash
gcloud run deploy recomendacion-service \
  --image europe-west1-docker.pkg.dev/PROJECT_ID/tankgo/recomendacion-img \
  --region europe-west1 \
  --platform managed \
  --set-env-vars ROUTING_BACKEND=ors,ROUTE_CANDIDATES_SOURCE=auto,POI_ACCESS_PROVIDER=auto \
  --set-secrets ORS_API_KEY=ors-api-key:latest,MAPBOX_ACCESS_TOKEN=mapbox-access-token:latest,GOOGLE_PLACES_API_KEY=google-places-api-key:latest
```

### 5) Stateless checklist

- No usa estado local persistente para negocio.
- Todo configurable por variables de entorno/secrets.
- Compatible con escalado horizontal de Cloud Run.

---

## `.env.example`

Se incluye `recomendacion-service/.env.example` con todas las variables necesarias para ejecutar localmente y en GCP sin hardcoding.
