# 🚗 TankGo - Plataforma de Gasolineras

<div align="center">

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)
![React](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react)
![Node.js](https://img.shields.io/badge/Node.js-20.0.0-339933?logo=node.js)
![Hono](https://img.shields.io/badge/Hono-4.0-orange?logo=hono)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa)

<img src="./frontend-client/public/logo.png" alt="Logo TankGo" width="180"/>

**Encuentra las gasolineras más baratas de España**

[Demo en vivo](https://tankgo.onrender.com) · [Documentación API](https://gateway-gzzi.onrender.com/docs)

</div>

---

## 📋 Descripción

TankGo es una plataforma modular para consultar, gestionar y visualizar información de gasolineras en España. Utiliza datos oficiales del Ministerio de Industria y permite a los usuarios encontrar las estaciones de servicio más económicas cerca de su ubicación.

### ✨ Características Principales

- 🔍 **Búsqueda inteligente** - Filtros por provincia, municipio, marca y precio
- 📍 **Geolocalización** - Encuentra gasolineras cercanas automáticamente
- 🗺️ **Mapa interactivo** - Visualiza gasolineras con logos de marcas
- 📊 **Historial de precios** - Gráficos de evolución temporal
- ❤️ **Favoritos** - Guarda tus gasolineras preferidas
- 📱 **PWA** - Instálala en tu móvil como app nativa
- 🔐 **Autenticación** - Login tradicional y Google OAuth

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           Frontend (React + Vite + TailwindCSS)          │    │
│  │                    PWA Ready                              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (Hono)                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  • Proxy reverso          • OAuth Handler                │    │
│  │  • Agregación OpenAPI     • CORS                         │    │
│  │  • Health checks          • Rate limiting                │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                    │                       │
                    ▼                       ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│    Usuarios Service          │  │    Gasolineras Service       │
│    (Fastify + PostgreSQL)    │  │    (FastAPI + MongoDB)       │
│                              │  │                              │
│  • Autenticación JWT         │  │  • Datos del gobierno        │
│  • Google OAuth              │  │  • Búsqueda geoespacial      │
│  • Gestión favoritos         │  │  • Historial precios         │
│  • Perfil usuario            │  │  • Estadísticas              │
└──────────────────────────────┘  └──────────────────────────────┘
            │                              │
            ▼                              ▼
    ┌──────────────┐              ┌──────────────┐
    │  PostgreSQL  │              │   MongoDB    │
    │   (Neon)     │              │   (Atlas)    │
    └──────────────┘              └──────────────┘
```

---

## 🛠️ Servicios

| Servicio | Stack | Puerto | Descripción |
|----------|-------|--------|-------------|
| **Frontend** | React, Vite, TailwindCSS | 80 | SPA con PWA |
| **Gateway** | Hono (Node.js) | 8080 | Proxy y OAuth |
| **Usuarios** | Fastify, PostgreSQL | 3001 | Auth y favoritos |
| **Gasolineras** | FastAPI, MongoDB | 8000 | Datos y búsquedas |
| **MongoDB** | Base de datos | 27017 | Datos de gasolineras |
| **PostgreSQL** | Base de datos | 5432 | Datos de usuarios |

---

## 🚀 Inicio Rápido

### Requisitos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose
- [Git](https://git-scm.com/)

### 1️⃣ Clonar el repositorio

```bash
git clone https://github.com/ikeralvis/gasolineras_project.git
cd gasolineras_project
```

### 2️⃣ Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

### 3️⃣ Levantar servicios

```bash
docker-compose up -d --build
```

### 4️⃣ Verificar servicios

```bash
docker-compose ps
```

### 5️⃣ Acceder a la aplicación

| Servicio | URL |
|----------|-----|
| 🌐 **Frontend** | http://localhost |
| 📖 **API Docs** | http://localhost:8080/docs |
| 🏥 **Health** | http://localhost:8080/health |

---

## 📖 API Endpoints

### Gateway (puerto 8080)

```
GET  /health                       # Estado de servicios
GET  /docs                         # Swagger UI
GET  /openapi.json                 # OpenAPI spec
```

### Usuarios (`/api/usuarios`)

```
POST /register                     # Registrar usuario
POST /login                        # Iniciar sesión
GET  /me                           # Perfil actual
PATCH /me                          # Actualizar perfil
GET  /google                       # OAuth Google
```

### Favoritos (`/api/usuarios/favoritos`)

```
GET  /                             # Listar favoritos
POST /                             # Añadir favorito
DELETE /{ideess}                   # Eliminar favorito
```

### Gasolineras (`/api/gasolineras`)

```
GET  /                             # Listar (con filtros)
GET  /{id}                         # Detalle
GET  /cerca?lat=X&lon=Y&km=Z       # Cercanas
GET  /estadisticas                 # Stats de precios
GET  /{id}/historial?dias=30       # Historial precios
GET  /{id}/cercanas                # Gasolineras cercanas
POST /sync                         # Sincronizar datos
GET  /count                        # Total
```

---

## 🔧 Configuración

### Variables de Entorno Principales

```env
# Base de datos
MONGO_URI=mongodb://...
DB_HOST=postgres
DB_USER=user
DB_PASSWORD=pass

# Autenticación
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# URLs
FRONTEND_URL=http://localhost
GATEWAY_URL=http://localhost:8080
```

---

## 📱 PWA (Progressive Web App)

TankGo es una Progressive Web App que puedes instalar:

1. Abre la app en Chrome/Edge
2. Haz clic en "Instalar" en la barra de direcciones
3. ¡Disfruta de la app como nativa!

**Características PWA:**
- ✅ Instalable en móvil y desktop
- ✅ Funciona offline (datos cacheados)
- ✅ Shortcuts de inicio rápido
- ✅ Iconos optimizados

---

## 🔍 Filtros Avanzados

### Filtros disponibles
- **Provincia y Municipio**: Autocompletado inteligente
- **Marca**: Repsol, Cepsa, BP, Shell, Galp, Eroski, Petronor, Carrefour...
- **Precio máximo**: Define tu límite
- **Tipo de combustible**: Gasolina 95, 98, Diésel, GLP...

---

## 🧪 Testing

Ver [Guía de Testing y CI/CD](./docs/TESTING_CI_GUIDE.md) para:

- Tests unitarios por servicio
- Tests de integración
- Tests E2E con Playwright/Cypress
- Configuración de GitHub Actions

```bash
# Frontend
cd frontend-client && pnpm test

# Usuarios
cd usuarios-service && npm test

# Gasolineras
cd gasolineras-service && pytest
```

---

## 📂 Estructura del Proyecto

```
gasolineras_project/
├── frontend-client/          # React SPA + PWA
│   ├── src/
│   │   ├── components/       # Componentes reutilizables
│   │   ├── pages/            # Páginas/vistas
│   │   ├── contexts/         # Context API
│   │   ├── api/              # Llamadas a API
│   │   └── services/         # Servicios (auth)
│   └── public/               # Assets + Service Worker
│
├── gateway-hono/             # API Gateway
│   └── src/
│       └── index.js          # Proxy + OAuth
│
├── usuarios-service/         # Microservicio usuarios
│   └── src/
│       ├── routes/           # Endpoints
│       ├── hooks/            # Middleware auth
│       └── utils/            # Validadores
│
├── gasolineras-service/      # Microservicio gasolineras
│   └── app/
│       ├── routes/           # Endpoints
│       ├── models/           # Schemas
│       ├── services/         # Lógica de negocio
│       └── db/               # Conexión MongoDB
│
├── docs/                     # Documentación
├── docker-compose.yml        # Orquestación
└── .env.example              # Template de config
```

---

## 🚀 Despliegue

### Docker (Local)

```bash
docker-compose up -d --build
```

### Render (Producción)

Cada servicio tiene su propio Dockerfile y se despliega automáticamente con GitHub.

**URLs de producción:**
- Frontend: https://tankgo.onrender.com
- Gateway: https://gateway-gzzi.onrender.com

---

## 🤝 Contribuir

1. Fork del repositorio
2. Crear rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit (`git commit -m 'Añadir funcionalidad'`)
4. Push (`git push origin feature/nueva-funcionalidad`)
5. Pull Request

---

## 📝 Licencia

MIT © [Iker Alvis](https://github.com/ikeralvis)

---

<div align="center">

Desarrollado con ❤️ para el proyecto TankGo

[⬆ Volver arriba](#-tankgo---plataforma-de-gasolineras)

</div>
