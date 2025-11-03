# 🚗 Sistema de Gasolineras - Microservicios# 🛢️ Gasolineras Project



<div align="center">Proyecto modular basado en microservicios para obtener, gestionar y mostrar información de gasolineras.



![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)---

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)

![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python)## 🚀 Estructura

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)```

gasolineras_project/

**Plataforma completa de consulta de precios de combustible en España**│

├── gateway-hono/          # API Gateway (Node.js + Hono)

[Características](#-características) • [Arquitectura](#-arquitectura) • [Instalación](#-instalación-rápida) • [Configuración](#️-configuración---variables-de-entorno)├── usuarios-service/      # Microservicio de usuarios (Node.js + Fastify)

├── gasolineras-service/   # Microservicio de datos (Python + FastAPI)

</div>├── frontend-client/       # SPA en React (HTML5)

└── docker-compose.yml     # Orquestación de servicios

---```



## 📋 Descripción---



Sistema de microservicios para consultar y gestionar información de estaciones de servicio en España. Los datos se obtienen desde la API oficial del Gobierno de España y se exponen a través de una arquitectura de microservicios moderna.## 🧰 Tecnologías



### 🎯 Funcionalidades- **Node.js** (Hono + Fastify)

- **Python** (FastAPI)

- ✅ **Autenticación de usuarios** con JWT- **MongoDB** y **PostgreSQL**

- ✅ **Gestión de favoritos** por usuario- **Docker** & **Docker Compose**

- ✅ **Consulta de gasolineras** con filtros avanzados- **Swagger / OpenAPI**

- ✅ **Sincronización automática** desde fuente oficial- **React** (SPA)

- ✅ **API Gateway** centralizado con documentación OpenAPI

- ✅ **Frontend React** moderno y responsive---



---## ⚙️ Instalación



## 🏗️ Arquitectura### 1️⃣ Clonar el repositorio

```bash

### Diagrama de Serviciosgit clone https://github.com/tuusuario/gasolineras_project.git

cd gasolineras_project

``````

┌─────────────────┐

│   Frontend      │  React + Vite (Puerto 80)### 2️⃣ Crear los archivos `.env`

│   (React)       │

└────────┬────────┘Copia los archivos `.env.example` y configura tus variables de entorno.

         │

         ↓### 3️⃣ Levantar todo con Docker

┌─────────────────┐```bash

│   API Gateway   │  Hono.js (Puerto 8080)docker compose up -d --build

│   (Hono.js)     │  - Enrutamiento```

└────────┬────────┘  - CORS

         │           - Documentación OpenAPI### 4️⃣ Comprobar endpoints

         │

    ┌────┴─────┐| Servicio      | Puerto | URL                              |

    ↓          ↓|---------------|--------|----------------------------------|

┌─────────┐  ┌──────────────┐| **Gateway**   | 8080   | http://localhost:8080            |

│Usuarios │  │ Gasolineras  │| Frontend      | 5173   | http://localhost:5173            |

│Service  │  │   Service    │| Usuarios      | 3001   | http://localhost:3001            |

│(Fastify)│  │  (FastAPI)   │| Gasolineras   | 8000   | http://localhost:8000            |

│Port 3001│  │  Port 8000   │| MongoDB       | 27017  | mongodb://localhost:27017        |

└────┬────┘  └──────┬───────┘| PostgreSQL    | 5432   | postgresql://localhost:5432      |

     │              │

     ↓              ↓---

┌──────────┐  ┌──────────┐

│PostgreSQL│  │ MongoDB  │## 🚪 API Gateway

│ Port 5432│  │Port 27017│

└──────────┘  └──────────┘El proyecto cuenta con un **API Gateway** construido con Hono.js que actúa como punto de entrada único:

```

- ✅ **Documentación OpenAPI/Swagger**: http://localhost:8080/docs

### 🔧 Tecnologías- ✅ **Health Check**: http://localhost:8080/health

- ✅ **Proxy inteligente** a todos los microservicios

| Componente | Tecnología | Puerto | Base de Datos |- ✅ **CORS** configurado

|------------|------------|--------|---------------|- ✅ **Logging** de todas las peticiones

| **Frontend** | React 18 + Vite | 80 | - |- ✅ **Manejo de errores** centralizado

| **Gateway** | Hono.js 4 | 8080 | - |

| **Usuarios** | Node.js + Fastify 5 | 3001 | PostgreSQL 16 |### Endpoints Principales

| **Gasolineras** | Python 3.11 + FastAPI | 8000 | MongoDB 7 |

```bash

---# Información del gateway

GET http://localhost:8080/

## 🚀 Instalación Rápida

# Documentación interactiva

### PrerrequisitosGET http://localhost:8080/docs



- [Docker](https://www.docker.com/get-started) y Docker Compose instalados# Usuarios

- GitPOST http://localhost:8080/api/usuarios/register

POST http://localhost:8080/api/usuarios/login

### 1️⃣ Clonar el RepositorioGET  http://localhost:8080/api/usuarios/favorites



```bash# Gasolineras

git clone https://github.com/ikeralvis/gasolineras_project.gitGET http://localhost:8080/api/gasolineras

cd gasolineras_project```

```

**📚 Más información**: Ver `gateway-hono/README.md`

### 2️⃣ Configurar Variables de Entorno

---

```bash

# Copiar el archivo de ejemplo## 🧪 Tests

cp .env.example .env

Pendiente de implementación en los microservicios.

# Editar el archivo .env con tus valores

# Windows: notepad .env---

# Linux/Mac: nano .env

```## 🧱 Despliegue futuro



**IMPORTANTE:** Genera un JWT_SECRET seguro:Se podrá desplegar fácilmente en:



```powershell- **Render.com**

# Windows PowerShell- **Railway.app**

.\generate-jwt-secret.ps1- **Fly.io**

```- **Docker Hub + VPS**



Copia el secreto generado y pégalo en `.env` en la variable `JWT_SECRET`.---



### 3️⃣ Levantar Todos los Servicios## ✅ Resultado final



```bash- El `.gitignore` mantiene limpio tu repo

# Construir y levantar todos los contenedores- Los `.env` nunca se suben

docker compose up -d- Cualquier persona puede clonar y levantar el proyecto con solo 2 comandos

- Tu README documenta el proceso de forma profesional

# Ver logs en tiempo real

docker compose logs -f---



# Ver estado de los servicios## 📝 Notas adicionales

docker compose ps

```¿Necesitas los archivos `.env.example` para cada servicio (Gateway, Usuarios y Gasolineras) con valores por defecto y explicación comentada? Esto facilitará la configuración inicial del proyecto.

### 4️⃣ Verificar que Todo Funciona

Abre tu navegador y visita:

- **Frontend:** http://localhost:80
- **API Gateway:** http://localhost:8080
- **Gateway Docs:** http://localhost:8080/docs
- **Usuarios API:** http://localhost:3001/health
- **Gasolineras API:** http://localhost:8000/health
- **Gasolineras Docs:** http://localhost:8000/docs

### ✅ Si todo está correcto verás:

```bash
✔ Container postgres            Running
✔ Container mongo               Running
✔ Container usuarios-service    Running
✔ Container gasolineras-service Running
✔ Container gateway-hono        Running
✔ Container frontend-client     Running
```

---

## ⚙️ Configuración - Variables de Entorno

### 📄 Archivo `.env` (Raíz del Proyecto)

Este es el **ÚNICO** archivo de configuración que necesitas. Contiene todas las variables para todos los servicios.

#### 🔑 Variables Principales

```env
# ===================================
# PUERTOS DE SERVICIOS
# ===================================
POSTGRES_PORT=5432
MONGO_PORT=27017
FRONTEND_PORT=80
GATEWAY_PORT=8080
USUARIOS_PORT=3001
GASOLINERAS_PORT=8000

# ===================================
# POSTGRESQL (usuarios-service)
# ===================================
DB_USER=postgres
DB_PASSWORD=admin              # ⚠️ Cambiar en producción
DB_NAME=usuarios_db
DB_HOST=postgres
DB_PORT=5432

# ===================================
# JWT (usuarios-service)
# ===================================
JWT_SECRET=tu-secreto-aqui     # 🔐 GENERAR con generate-jwt-secret.ps1
JWT_EXPIRES_IN=7d

# ===================================
# CORS - GLOBAL
# ===================================
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:80
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:80

# ===================================
# MONGODB (gasolineras-service)
# ===================================
MONGO_INITDB_ROOT_USERNAME=user_gasolineras
MONGO_INITDB_ROOT_PASSWORD=secret_mongo_pwd   # ⚠️ Cambiar en producción
MONGO_DB_NAME=db_gasolineras
MONGO_HOST=mongo

# Variables del microservicio
MONGO_USER=
MONGO_PASS=
MONGO_DB=gasolineras_db

# ===================================
# API DEL GOBIERNO
# ===================================
GOBIERNO_API_URL=https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/
API_TIMEOUT=30

# ===================================
# LOGGING
# ===================================
LOG_LEVEL=INFO
```

### 📚 Archivos `.env.example`

Cada servicio tiene su propio `.env.example` que documenta las variables específicas que usa:

- `usuarios-service/.env.example` - Variables del servicio de usuarios
- `gasolineras-service/.env.example` - Variables del servicio de gasolineras
- `gateway-hono/.env.example` - Variables del gateway

**Estos archivos son solo documentación** y no se usan en Docker Compose. El `.env` global es el que importa.

### 🔒 Seguridad

#### ✅ Archivos que SÍ se suben a Git:
- ✅ `.env.example` (plantillas sin secretos)
- ✅ `README.md`
- ✅ Código fuente

#### ❌ Archivos que NO se suben a Git:
- ❌ `.env` (contiene secretos reales)
- ❌ `node_modules/`, `__pycache__/`, etc.
- ❌ Logs y archivos temporales

---

## 🎮 Comandos Docker Útiles

### Gestión de Contenedores

```bash
# Levantar todos los servicios
docker compose up -d

# Parar todos los servicios
docker compose down

# Parar y eliminar volúmenes (⚠️ elimina datos de BD)
docker compose down -v

# Reconstruir imágenes
docker compose build

# Reconstruir y levantar
docker compose up -d --build

# Ver logs de todos los servicios
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f usuarios
docker compose logs -f gasolineras
docker compose logs -f gateway

# Ver estado de servicios
docker compose ps

# Reiniciar un servicio
docker compose restart usuarios
```

### Acceso a Contenedores

```bash
# Entrar al contenedor de usuarios
docker exec -it usuarios-service sh

# Entrar al contenedor de gasolineras
docker exec -it gasolineras-service bash

# Entrar a PostgreSQL
docker exec -it postgres psql -U postgres -d usuarios_db

# Entrar a MongoDB
docker exec -it mongo mongosh
```

### Limpieza

```bash
# Limpiar contenedores parados
docker container prune

# Limpiar imágenes sin usar
docker image prune

# Limpiar todo (⚠️ cuidado)
docker system prune -a
```

---

## 📡 API Endpoints

### 🌐 API Gateway (Puerto 8080)

#### Documentación Interactiva
- **Swagger UI:** http://localhost:8080/docs

#### Endpoints

```bash
GET  /                          # Info del gateway
GET  /health                    # Health check
GET  /api/usuarios/*            # Proxy a usuarios-service
GET  /api/gasolineras/*         # Proxy a gasolineras-service
```

---

### 👤 Servicio de Usuarios (Puerto 3001)

#### Documentación
- **Swagger:** http://localhost:3001/documentation

#### Autenticación

```bash
# Registrar usuario
POST http://localhost:8080/api/usuarios/auth/register
Content-Type: application/json

{
  "email": "usuario@example.com",
  "password": "password123",
  "nombre": "Juan Pérez"
}

# Iniciar sesión
POST http://localhost:8080/api/usuarios/auth/login
Content-Type: application/json

{
  "email": "usuario@example.com",
  "password": "password123"
}
```

#### Favoritos (requiere autenticación)

```bash
# Obtener favoritos del usuario
GET http://localhost:8080/api/usuarios/favorites
Authorization: Bearer <tu-token-jwt>

# Añadir a favoritos
POST http://localhost:8080/api/usuarios/favorites
Authorization: Bearer <tu-token-jwt>
Content-Type: application/json

{
  "gasolinera_id": "12345"
}

# Eliminar de favoritos
DELETE http://localhost:8080/api/usuarios/favorites/12345
Authorization: Bearer <tu-token-jwt>
```

---

### ⛽ Servicio de Gasolineras (Puerto 8000)

#### Documentación
- **Swagger:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

#### Consulta de Gasolineras

```bash
# Obtener todas (con paginación)
GET http://localhost:8080/api/gasolineras/?limit=50&skip=0

# Filtrar por provincia
GET http://localhost:8080/api/gasolineras/?provincia=madrid

# Filtrar por municipio
GET http://localhost:8080/api/gasolineras/?municipio=madrid

# Filtrar por precio máximo
GET http://localhost:8080/api/gasolineras/?precio_max=1.50

# Combinación de filtros
GET http://localhost:8080/api/gasolineras/?provincia=madrid&precio_max=1.50&limit=20
```

#### Sincronización

```bash
# Sincronizar datos desde API del gobierno (tarda ~30 segundos)
POST http://localhost:8080/api/gasolineras/sync

# Contar gasolineras en BD
GET http://localhost:8080/api/gasolineras/count
```

---

## 🧪 Testing

### Probar el API Gateway

```bash
# Test automatizado del gateway
cd gateway-hono
node test-gateway.js
```

### Probar Servicios Individualmente

```bash
# Health checks
curl http://localhost:3001/health
curl http://localhost:8000/health
curl http://localhost:8080/health

# Sincronizar gasolineras
curl -X POST http://localhost:8080/api/gasolineras/sync

# Registrar usuario
curl -X POST http://localhost:8080/api/usuarios/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "nombre": "Test User"
  }'
```

---

## 📁 Estructura del Proyecto

```
gasolineras_project/
├── .env                        # ✅ Configuración global (NO subir a Git)
├── .env.example                # ✅ Plantilla de configuración (SÍ subir a Git)
├── .gitignore                  # ✅ Archivos ignorados por Git
├── docker-compose.yml          # ✅ Orquestación de servicios
├── generate-jwt-secret.ps1     # ✅ Script para generar JWT secret
├── README.md                   # ✅ Este archivo
│
├── frontend-client/            # Frontend React + Vite
│   ├── Dockerfile
│   ├── package.json
│   ├── README.md              # Docs específicas del frontend
│   └── src/
│
├── gateway-hono/               # API Gateway con Hono.js
│   ├── Dockerfile
│   ├── index.js
│   ├── package.json
│   ├── README.md              # Docs específicas del gateway
│   └── .env.example           # 📖 Variables del gateway (documentación)
│
├── usuarios-service/           # Microservicio de usuarios (Node.js)
│   ├── Dockerfile
│   ├── package.json
│   ├── init.sql
│   ├── README.MD              # Docs específicas de usuarios
│   ├── .env.example           # 📖 Variables del servicio (documentación)
│   └── src/
│       ├── index.js
│       ├── routes/
│       ├── middlewares/
│       └── hooks/
│
└── gasolineras-service/        # Microservicio de gasolineras (Python)
    ├── Dockerfile
    ├── requirements.txt
    ├── README.md              # Docs específicas de gasolineras
    ├── .env.example           # 📖 Variables del servicio (documentación)
    └── app/
        ├── main.py
        ├── routes/
        ├── services/
        ├── models/
        └── db/
```

---

## 🐛 Solución de Problemas

### ❌ Error: "Cannot connect to the Docker daemon"

```bash
# Asegúrate de que Docker Desktop esté ejecutándose
# Windows: Inicia Docker Desktop desde el menú de inicio
```

### ❌ Error: "Port is already allocated"

```bash
# Algún puerto está ocupado, cámbialo en .env
# Por ejemplo, si el puerto 80 está ocupado:
FRONTEND_PORT=3000

# Luego reconstruye:
docker compose down
docker compose up -d
```

### ❌ Error: "usuarios-service is unhealthy"

```bash
# Ver logs del servicio
docker compose logs usuarios

# Verificar que PostgreSQL esté levantado
docker compose ps postgres

# Reiniciar servicios
docker compose restart usuarios
```

### ❌ Error: "JWT verification failed"

```bash
# Regenera el JWT_SECRET
.\generate-jwt-secret.ps1

# Actualiza .env con el nuevo secreto
# Reconstruye el servicio de usuarios
docker compose restart usuarios
```

### ❌ No se sincronizan las gasolineras

```bash
# Verifica la conexión a MongoDB
docker exec -it mongo mongosh

# Verifica logs del servicio
docker compose logs gasolineras

# Intenta sincronizar manualmente
curl -X POST http://localhost:8080/api/gasolineras/sync
```

---

## 🚀 Despliegue en Producción

### Consideraciones

1. **Variables de Entorno**
   - No uses archivos `.env` en producción
   - Usa variables de entorno del sistema o secret managers

2. **Seguridad**
   - Cambia todas las contraseñas por defecto
   - Genera un JWT_SECRET único y seguro
   - Configura CORS solo con dominios permitidos
   - Usa HTTPS

3. **Base de Datos**
   - Usa servicios gestionados (AWS RDS, MongoDB Atlas)
   - Configura backups automáticos
   - Habilita SSL para conexiones

4. **Monitoreo**
   - Health checks en `/health`
   - Logs centralizados
   - Métricas de rendimiento

### Ejemplo Docker Compose Producción

```yaml
services:
  gateway:
    image: gasolineras-gateway:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=8080
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

---

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📄 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

---

## 👤 Autor

**Iker Alvis**
- GitHub: [@ikeralvis](https://github.com/ikeralvis)

---

## 📞 Soporte

Si tienes problemas o preguntas:

1. Revisa la sección [Solución de Problemas](#-solución-de-problemas)
2. Consulta los logs: `docker compose logs -f`
3. Abre un issue en GitHub

---

<div align="center">

**⭐ Si este proyecto te resulta útil, considera darle una estrella en GitHub**

Hecho con ❤️ usando Docker, Node.js, Python y React

</div>
