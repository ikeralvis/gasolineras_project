# 🚗 Microservicio de Gasolineras

<div align="center">

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)
![MongoDB](https://img.shields.io/badge/MongoDB-7.0-green?logo=mongodb)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)

API REST para sincronizar y consultar información de estaciones de servicio en España desde la fuente oficial del Gobierno.

[Características](#-características) • [Instalación](#-instalación) • [API](#-api) • [Docker](#-docker)

</div>

---

## 📋 Descripción

Microservicio Python construido con **FastAPI** que permite:
- 📥 **Sincronizar** datos actualizados desde la API oficial del Ministerio de Energía
- 📊 **Consultar** gasolineras con filtros avanzados
- 🗺️ **Filtrar** por ubicación geográfica (provincia, municipio)
- 💰 **Buscar** por rangos de precios de combustible
- 📄 **Paginar** resultados para consultas eficientes

Los datos provienen de la fuente oficial:
```
https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/
```

---

## ✅ Contrato de Endpoints (actual)

Todos los endpoints funcionales viven bajo prefijo `/gasolineras`:

- `GET /gasolineras/`:
  - obtener listado con filtros opcionales (`provincia`, `municipio`, `precio_max`, `skip`, `limit`)
  - funciona también sin filtros
- `GET /gasolineras/cerca`:
  - obtener estaciones cercanas por `lat`, `lon`, `km`, `limit`
- `GET /gasolineras/{id}`:
  - detalle de estación
- `GET /gasolineras/{id}/cercanas`:
  - cercanas respecto a una estación
- `GET /gasolineras/{id}/historial`:
  - histórico de precios para gráfico
- `POST /gasolineras/markers`:
  - datos de mapa por viewport (clusters o estaciones)
- `POST /gasolineras/sync`:
  - carga snapshot desde API oficial y guarda en BD (requiere `X-Internal-Secret`)
- `POST /gasolineras/ensure-fresh`:
  - sincroniza solo si no hay snapshot vigente del día (requiere `X-Internal-Secret`)
- `GET /gasolineras/snapshot`:
  - estado de frescura (último sync, fecha local, vigente/no vigente)

---

## 🔄 Frescura de datos (operación cloud)

Estrategia recomendada de producción para evitar datos desactualizados:

- `startup guard`:
  - al arrancar `gasolineras-service`, si no hay snapshot vigente del día, ejecuta sync automático
  - controlado por `AUTO_ENSURE_FRESH_ON_STARTUP=true`
- `scheduler interno en gateway`:
  - el gateway llama periódicamente a `POST /gasolineras/ensure-fresh`
  - variables: `GASOLINERAS_AUTO_ENSURE_FRESH_ENABLED`, `GASOLINERAS_AUTO_ENSURE_INTERVAL_MINUTES`
- `read-time autosync` (opcional):
  - si activas `AUTO_SYNC_ON_READ=true`, al leer datos (listado/markers/etc.) intenta refrescar si no hay snapshot del día
  - recomendado como fallback, no como mecanismo principal

Patrón profesional recomendado:

- principal: scheduler (Cloud Scheduler / EventBridge / cron)
- respaldo: startup guard
- opcional: read-time fallback para resiliencia

---

### ✨ Características

### 🔧 Técnicas
- ✅ **FastAPI** con documentación OpenAPI automática
- ✅ **MongoDB** para almacenamiento de datos
- ✅ **Pydantic** para validación de modelos
- ✅ **Logging** estructurado con Python logging
- ✅ **Manejo de errores** robusto con HTTPException
- ✅ **CORS** configurado para integración con frontend
- ✅ **Health checks** para monitoreo
- ✅ **Variables de entorno** para configuración flexible
- ✅ **Reintentos automáticos** en peticiones HTTP
- ✅ **Índices geoespaciales** para búsquedas por ubicación

### 🎯 Funcionales
- 🔄 Sincronización manual desde API del gobierno
- 📊 Consulta con filtros múltiples
- 📄 Paginación configurable (hasta 1000 resultados)
- 🔍 Búsqueda por texto en provincia/municipio
- 💶 Filtrado por precio máximo
- 📍 Datos geográficos con coordenadas WGS84
- 🗺️ Búsqueda de gasolineras cercanas por radio
- 📈 **Historial de precios** con tracking temporal
- 📊 **Evolución de precios** por combustible

---

## 📁 Estructura del Proyecto

```
gasolineras-service/
├── app/
│   ├── __init__.py
│   ├── main.py                 # Aplicación FastAPI principal
│   ├── db/
│   │   └── connection.py       # Gestión de conexión MongoDB
│   ├── models/
│   │   └── gasolinera.py       # Modelos Pydantic
│   ├── routes/
│   │   └── gasolineras.py      # Endpoints de la API
│   └── services/
│       └── fetch_gobierno.py   # Cliente API del gobierno
├── requirements.txt            # Dependencias Python
├── Dockerfile                  # Configuración Docker
├── .env.example               # Variables de entorno
├── .gitignore                 # Archivos ignorados
└── README.md                  # Esta documentación
```

---

## 🚀 Instalación con Docker 🐳

#### 1️⃣ Construir imagen

```bash
docker build -t gasolineras-service .
```

#### 2️⃣ Ejecutar contenedor

```bash
docker run -d \
  --name gasolineras-service \
  -p 8000:8000 \
  -e MONGO_HOST=mongo \
  -e MONGO_PORT=27017 \
  gasolineras-service
```

#### 3️⃣ Con Docker Compose (recomendado)

```yaml
# docker-compose.yml
services:
  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

  gasolineras:
    build: ./gasolineras-service
    ports:
      - "8000:8000"
    environment:
      - MONGO_HOST=mongo
      - MONGO_PORT=27017
    depends_on:
      - mongo

volumes:
  mongo_data:
```

```bash
# Levantar todos los servicios
docker compose up -d

# Ver logs
docker compose logs -f gasolineras
```

---

## 📚 API - Endpoints

### 🏠 General

#### `GET /`
Obtén información básica del servicio.

**Respuesta:**
```json
{
  "service": "microservicio-gasolineras",
  "version": "1.0.0",
  "docs": "/docs",
  "redoc": "/redoc"
}
```

---

#### `GET /health`
Verifica el estado del servicio y la conexión con la base de datos.

**Respuesta exitosa:**
```json
{
  "status": "healthy",
  "database": "connected"
}
```

---

### ⛽ Gasolineras

#### `GET /gasolineras/`
Obtén una lista de gasolineras con filtros opcionales.

**Parámetros opcionales:**
- `provincia` (string): Filtrar por provincia.
- `municipio` (string): Filtrar por municipio.
- `precio_max` (float): Precio máximo de gasolina 95.
- `skip` (int): Número de resultados a omitir (paginación).
- `limit` (int): Número máximo de resultados (máximo: 1000).

**Ejemplo:**
```bash
GET /gasolineras/?provincia=Madrid&limit=50
```

**Respuesta:**
```json
{
  "total": 11547,
  "results": [
    {
      "id": "1234",
      "nombre": "Gasolinera Ejemplo",
      "precio_gasolina_95": 1.50,
      "provincia": "Madrid",
      "municipio": "Madrid"
    }
  ]
}
```

---

#### `POST /gasolineras/sync`
Sincroniza los datos desde la API oficial del Gobierno de España.

**Nota:** Esta operación elimina los datos existentes y los reemplaza con los más recientes.

**Respuesta:**
```json
{
  "mensaje": "Datos sincronizados correctamente",
  "total": 11612
}
```

---

#### `GET /gasolineras/{id}`
Obtén los detalles de una gasolinera específica por su ID.

**Ejemplo:**
```bash
GET /gasolineras/1234
```

**Respuesta:**
```json
{
  "id": "1234",
  "nombre": "Gasolinera Ejemplo",
  "precio_gasolina_95": 1.50,
  "provincia": "Madrid",
  "municipio": "Madrid",
  "coordenadas": {
    "lat": 40.4168,
    "lng": -3.7038
  }
}
```

---

#### `GET /gasolineras/{id}/cercanas`
Obtén gasolineras cercanas a una gasolinera específica.

**Parámetros opcionales:**
- `radio_km` (float): Radio de búsqueda en kilómetros (por defecto: 5).

**Ejemplo:**
```bash
GET /gasolineras/1234/cercanas?radio_km=10
```

**Respuesta:**
```json
{
  "origen": "1234",
  "cercanas": [
    {
      "id": "5678",
      "nombre": "Gasolinera Cercana",
      "distancia_km": 3.2
    }
  ]
}
```

---

#### `GET /gasolineras/{id}/historial`
Consulta el historial de precios de una gasolinera.

**Parámetros opcionales:**
- `dias` (int): Número de días hacia atrás para consultar (por defecto: 30).

**Ejemplo:**
```bash
GET /gasolineras/1234/historial?dias=90
```

**Respuesta:**
```json
{
  "id": "1234",
  "historial": [
    {
      "fecha": "2025-11-01",
      "precio_gasolina_95": 1.45
    },
    {
      "fecha": "2025-11-02",
      "precio_gasolina_95": 1.47
    }
  ]
}
```

---

## 📖 Documentación Interactiva

FastAPI genera automáticamente documentación interactiva para explorar y probar los endpoints:

- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
  - Interfaz visual moderna para probar los endpoints.
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)
  - Documentación detallada con esquemas de datos.

Accede a estas herramientas mientras el servicio esté en ejecución.

---

## 🔧 Configuración

### Variables de Entorno

Copia `.env.example` a `.env` y ajusta los valores:

```env
# MongoDB
MONGO_HOST=mongo                # Host de MongoDB
MONGO_PORT=27017                # Puerto de MongoDB
MONGO_USER=                     # Usuario (opcional)
MONGO_PASS=                     # Contraseña (opcional)
MONGO_DB=gasolineras_db         # Nombre de la base de datos

# API del Gobierno
GOBIERNO_API_URL=https://sedeaplicaciones.minetur.gob.es/...
API_TIMEOUT=30                  # Timeout en segundos

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:8080

# Logging
LOG_LEVEL=INFO                  # DEBUG, INFO, WARNING, ERROR

# Puerto
PORT=8000
```

---

## 🧪 Testing

### Con curl

```bash
# Health check
curl http://localhost:8000/health

# Sincronizar datos
curl -X POST http://localhost:8000/gasolineras/sync

# Obtener gasolineras
curl "http://localhost:8000/gasolineras/?limit=5"

# Filtrar por provincia
curl "http://localhost:8000/gasolineras/?provincia=madrid"
```

### Con Python

```python
import requests

# Sincronizar
response = requests.post("http://localhost:8000/gasolineras/sync")
print(response.json())

# Consultar con filtros
params = {
    "provincia": "madrid",
    "precio_max": 1.50,
    "limit": 10
}
response = requests.get("http://localhost:8000/gasolineras/", params=params)
print(response.json())
```

---

## 🔍 Logs

El servicio genera logs estructurados:

```
2024-01-15 10:30:45 - app.main - INFO - 🚀 Iniciando microservicio de gasolineras...
2024-01-15 10:30:45 - app.db.connection - INFO - ✅ Conectado a MongoDB en mongo:27017
2024-01-15 10:30:51 - app.services.fetch_gobierno - INFO - 🌐 Consultando API del gobierno...
2024-01-15 10:30:53 - app.services.fetch_gobierno - INFO - 📥 Recibidos 11612 registros de la API
2024-01-15 10:30:53 - app.routes.gasolineras - INFO - ✅ Sincronización completada: 11612 gasolineras
```

---

## 📊 Modelo de Datos

### Gasolinera

```python
{
  "IDEESS": "12345",              # ID único
  "Rótulo": "REPSOL",             # Nombre comercial
  "Municipio": "MADRID",          # Municipio
  "Provincia": "MADRID",          # Provincia
  "Dirección": "CALLE MAYOR 123", # Dirección
  "Precio Gasolina 95 E5": "1.459", # Precio gasolina (€/L)
  "Precio Gasoleo A": "1.329",    # Precio diésel (€/L)
  "Latitud": 40.4168,             # Coordenada GPS
  "Longitud": -3.7038             # Coordenada GPS
}
```

---

## 🔐 Seguridad

- ✅ CORS configurado para orígenes específicos
- ✅ Validación de datos con Pydantic
- ✅ Manejo de errores sin exposición de detalles internos
- ✅ Timeout en peticiones HTTP
- ✅ Logs sin información sensible

---

## 🚀 Despliegue en Producción

### Recomendaciones

1. **Usar workers múltiples:**
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

2. **Proxy inverso con Nginx:**
```nginx
location /api/gasolineras/ {
    proxy_pass http://localhost:8000/gasolineras/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

3. **Monitoreo:**
- Health check endpoint: `/health`
- Logs centralizados
- Alertas en sincronizaciones fallidas

4. **Sincronización automática (opcional):**

Puedes usar APScheduler para sincronizar automáticamente:

```python
# En app/main.py
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()
scheduler.add_job(
    sync_gasolineras_job,
    'cron',
    hour=6,
    minute=0
)
scheduler.start()
```

---

## 🛠️ Tecnologías

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Python | 3.11 | Lenguaje base |
| FastAPI | 0.115 | Framework web |
| Uvicorn | 0.34 | Servidor ASGI |
| MongoDB | 7.0 | Base de datos |
| Pydantic | 2.10 | Validación |
| Requests | 2.32 | Cliente HTTP |

---

## 🤝 Integración con Gateway

Este microservicio está diseñado para funcionar detrás de un API Gateway:

```javascript
// Gateway Hono
app.all('/api/gasolineras/*', async (c) => {
  const path = c.req.path.replace('/api/gasolineras', '/gasolineras')
  return fetch(`http://gasolineras:8000${path}`)
})
```

**URLs públicas:**
- `GET /api/gasolineras/` → Consultar gasolineras
- `POST /api/gasolineras/sync` → Sincronizar datos
- `GET /api/gasolineras/count` → Contar total

---

## 📝 Licencia

Este proyecto es parte del sistema de gasolineras y está disponible para uso educativo y personal.

---

## 🐛 Soporte

Si encuentras algún problema:

1. Revisa los logs: `docker compose logs gasolineras`
2. Verifica la conexión a MongoDB: `GET /health`
3. Confirma las variables de entorno en `.env`
4. Asegúrate de que la API del gobierno esté disponible

---

## 📞 Contacto

Para más información sobre el sistema completo, consulta la documentación del API Gateway y los demás microservicios.

---

<div align="center">

**Hecho con ❤️ usando FastAPI y Python**

⭐ Si te resulta útil, considera darle una estrella al proyecto

</div>
