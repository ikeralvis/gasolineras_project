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

**Arquitectura recomendada**: este servicio consume routing a través del gateway (`USE_GATEWAY_ROUTING=true`), y el gateway es quien habla con ORS/OSRM.

---

### Lógica A→B y A→parada→B

El desvío se calcula así:

```
desvío_km = dist(A → gasolinera) + dist(gasolinera → B) − dist(A → B)
```

Se usa la **fórmula de haversine** (distancia geodésica) escalada por un factor de carretera (~1.3×) como aproximación rápida. Esto evita lanzar una llamada al motor de routing por cada candidato (pueden ser cientos).

Para el usuario final, el resultado práctico es:
- **desvío_km = 0** → la gasolinera está casi en la ruta, no desvías nada.
- **desvío_km = 3** → tendrás que salir 1.5 km de la autovía y volver.
- **desvío_km > max_desvio_km** → se descarta automáticamente.

---

### ¿Por qué haversine en lugar de una llamada OSRM por candidato?

- España tiene ~11 000 gasolineras. Lanzar 11 000 peticiones de routing es inviable.
- El pre-filtrado geométrico (Shapely) reduce los candidatos a ~50–200.
- Para esos candidatos, haversine × 1.3 tiene un error < 15 % respecto al desvío real por carretera, suficiente para clasificar.
- Si necesitas precisión absoluta, puedes llamar OSRM con waypoints para el top-5 final.

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
| `ROUTING_BACKEND` | `osrm` | `osrm` o `ors` |
| `USE_GATEWAY_ROUTING` | `true` | Si está activo, usa `/api/routing/*` del gateway |
| `ROUTING_PROXY_URL` | `http://gateway:8080/api/routing` | Endpoint interno del gateway para directions/matrix |
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
