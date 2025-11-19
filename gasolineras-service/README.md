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

## 🚀 Instalación

### Opción 1: Local (sin Docker)

#### 1️⃣ Requisitos previos
- Python 3.11 o superior
- MongoDB 7.0 o superior
- pip

#### 2️⃣ Clonar e instalar dependencias

```bash
# Navegar a la carpeta del servicio
cd gasolineras-service

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
# Windows PowerShell
.\venv\Scripts\Activate.ps1
# Windows CMD
.\venv\Scripts\activate.bat
# Linux/Mac
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt
```

#### 3️⃣ Configurar variables de entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar .env con tu configuración
# Nota: En Windows usar 'copy' en lugar de 'cp'
```

```env
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_DB=gasolineras_db
```

#### 4️⃣ Ejecutar el servidor

```bash
# Modo desarrollo (con recarga automática)
uvicorn app.main:app --reload --port 8000

# Modo producción
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

El servicio estará disponible en: **http://localhost:8000**

---

### Opción 2: Con Docker 🐳

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
Información básica del servicio.

**Respuesta:**
```json
{
  "service": "microservicio-gasolineras",
  "version": "1.0.0",
  "status": "running",
  "docs": "/docs",
  "redoc": "/redoc"
}
```

---

#### `GET /health`
Health check para monitoreo.

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
Obtiene la lista de gasolineras con filtros opcionales.

**Query Parameters:**
| Parámetro | Tipo | Descripción | Default |
|-----------|------|-------------|---------|
| `provincia` | string | Filtrar por provincia | - |
| `municipio` | string | Filtrar por municipio | - |
| `precio_max` | float | Precio máximo gasolina 95 | - |
| `skip` | int | Elementos a saltar | 0 |
| `limit` | int | Máximo de resultados (max: 1000) | 100 |

**Ejemplo de petición:**
```bash
# Todas las gasolineras de Madrid
GET /gasolineras/?provincia=madrid&limit=50

# Con precio menor a 1.50€
GET /gasolineras/?precio_max=1.50

# Paginación (página 2, 20 por página)
GET /gasolineras/?skip=20&limit=20
```

**Respuesta:**
```json
{
  "total": 11547,
  "skip": 0,
  "limit": 100,
  "count": 100,
  "gasolineras": [
    {
      "IDEESS": "12345",
      "Rótulo": "REPSOL",
      "Municipio": "MADRID",
      "Provincia": "MADRID",
      "Dirección": "CALLE MAYOR 123",
      "Precio Gasolina 95 E5": "1.459",
      "Precio Gasoleo A": "1.329",
      "Latitud": 40.4168,
      "Longitud": -3.7038
    }
  ]
}
```

---

#### `POST /gasolineras/sync`
Sincroniza los datos desde la API del Gobierno de España.

⚠️ **Atención:** Esta operación:
- Elimina todos los datos existentes en la base de datos de gasolineras actuales
- Descarga datos actualizados desde la API oficial
- **Guarda snapshot en historial de precios** con timestamp del día
- Puede tardar 10-30 segundos

**Respuesta:**
```json
{
  "mensaje": "Datos sincronizados correctamente 🚀",
  "registros_eliminados": 11547,
  "registros_insertados": 11612,
  "registros_historicos": 11612,
  "fecha_snapshot": "2024-01-15T00:00:00+00:00",
  "total": 11612
}
```

**Errores posibles:**
- `503 Service Unavailable` - API del gobierno no disponible
- `500 Internal Server Error` - Error en la sincronización

💡 **Tip:** Ejecuta este endpoint periódicamente (ej: diario con cron job) para acumular datos históricos. Ver [HISTORIAL_PRECIOS.md](./HISTORIAL_PRECIOS.md) para configurar sincronización automática.

---

#### `GET /gasolineras/count`
Cuenta el número total de gasolineras almacenadas.

**Respuesta:**
```json
{
  "total": 11612,
  "mensaje": "Total de gasolineras: 11612"
}
```

---

#### `GET /gasolineras/{id}`
Obtiene los detalles completos de una gasolinera específica por su ID.

**Path Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | IDEESS de la gasolinera |

**Ejemplo:**
```bash
GET /gasolineras/1234
```

**Respuesta:**
```json
{
  "IDEESS": "1234",
  "Rótulo": "REPSOL",
  "Municipio": "MADRID",
  "Provincia": "MADRID",
  "Dirección": "CALLE MAYOR 123",
  "Precio Gasolina 95 E5": "1.459",
  "Precio Gasolina 98 E5": "1.589",
  "Precio Gasoleo A": "1.329",
  "Latitud": 40.4168,
  "Longitud": -3.7038
}
```

---

#### `GET /gasolineras/{id}/cercanas`
Obtiene gasolineras cercanas a una gasolinera específica.

**Path Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | IDEESS de la gasolinera de referencia |

**Query Parameters:**
| Parámetro | Tipo | Descripción | Default |
|-----------|------|-------------|---------|
| `radio_km` | float | Radio de búsqueda en km | 5 |

**Ejemplo:**
```bash
GET /gasolineras/1234/cercanas?radio_km=10
```

**Respuesta:**
```json
{
  "origen": "1234",
  "radio_km": 10,
  "cantidad": 8,
  "gasolineras_cercanas": [
    {
      "IDEESS": "5678",
      "Rótulo": "CEPSA",
      "distancia": 1.234,
      "Precio Gasolina 95 E5": "1.449"
    }
  ]
}
```

---

#### `GET /gasolineras/{id}/historial` 🆕
Obtiene el historial de precios de una gasolinera en el período especificado.

**Path Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | IDEESS de la gasolinera |

**Query Parameters:**
| Parámetro | Tipo | Descripción | Default | Rango |
|-----------|------|-------------|---------|-------|
| `dias` | int | Días hacia atrás | 30 | 1-365 |

**Ejemplo:**
```bash
# Últimos 30 días
GET /gasolineras/1234/historial

# Últimos 90 días
GET /gasolineras/1234/historial?dias=90
```

**Respuesta con datos:**
```json
{
  "IDEESS": "1234",
  "dias_consultados": 30,
  "fecha_desde": "2023-12-16T00:00:00+00:00",
  "fecha_hasta": "2024-01-15T00:00:00+00:00",
  "registros": 15,
  "historial": [
    {
      "IDEESS": "1234",
      "fecha": "2023-12-16T00:00:00+00:00",
      "precios": {
        "Gasolina 95 E5": "1.459",
        "Gasolina 98 E5": "1.589",
        "Gasóleo A": "1.329",
        "Gasóleo B": "1.249",
        "Gasóleo Premium": "1.459"
      }
    }
  ]
}
```

**Respuesta sin datos:**
```json
{
  "IDEESS": "1234",
  "dias_consultados": 30,
  "fecha_desde": "2023-12-16T00:00:00+00:00",
  "fecha_hasta": "2024-01-15T00:00:00+00:00",
  "registros": 0,
  "mensaje": "No hay datos históricos disponibles para este período",
  "historial": []
}
```

ℹ️ **Nota sobre datos históricos:** El historial se construye con cada ejecución de `/sync`. En la primera sincronización solo habrá datos del día actual. Para acumular datos históricos, ejecuta `/sync` periódicamente (recomendado: diario). Ver [HISTORIAL_PRECIOS.md](./HISTORIAL_PRECIOS.md) para más detalles.

---

## 📖 Documentación Interactiva

FastAPI genera automáticamente documentación interactiva:

### Swagger UI
```
http://localhost:8000/docs
```
- 🎨 Interfaz visual moderna
- 🧪 Prueba endpoints directamente desde el navegador
- 📝 Esquemas de datos completos

### ReDoc
```
http://localhost:8000/redoc
```
- 📄 Documentación tipo libro
- 🔍 Búsqueda avanzada
- 📱 Responsive design

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
