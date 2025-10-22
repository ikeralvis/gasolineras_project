# 🔐 Microservicio de Usuarios

Microservicio para gestión de usuarios, autenticación JWT y favoritos de estaciones de servicio.

## 📋 Tabla de Contenidos

- [Tecnologías](#tecnologías)
- [Características](#características)
- [Requisitos Previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Uso](#uso)
- [Endpoints API](#endpoints-api)
- [Autenticación](#autenticación)
- [Base de Datos](#base-de-datos)
- [Testing con Swagger](#testing-con-swagger)
- [Despliegue con Docker](#despliegue-con-docker)

## 🚀 Tecnologías

- **Node.js** v20+
- **Fastify** - Framework web de alto rendimiento
- **PostgreSQL 16** - Base de datos relacional
- **JWT** - Autenticación basada en tokens
- **bcryptjs** - Hash seguro de contraseñas
- **Swagger/OpenAPI** - Documentación interactiva de la API
- **Docker** - Contenedorización

## ✨ Características

- Registro y autenticación de usuarios
- Tokens JWT con expiración configurable
- Hash seguro de contraseñas con bcrypt
- Gestión de favoritos (estaciones de servicio)
- Control de acceso basado en roles (admin)
- Documentación interactiva con Swagger UI
- Validación de esquemas con JSON Schema
- Logs estructurados
- Protección con Helmet (seguridad HTTP)

## 📦 Requisitos Previos

- Node.js 20+ y npm
- PostgreSQL 16+
- Docker y Docker Compose (opcional)

## 🔧 Instalación

### Opción 1: Local

```bash
# Clonar el repositorio
cd usuarios-service

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Edita .env con tus credenciales

# Inicializar base de datos
psql -U postgres -d usuarios_db < init.sql

# Ejecutar en desarrollo
npm run dev

# Ejecutar en producción
npm start
```

### Opción 2: Docker Compose

```bash
# Desde la raíz del proyecto
docker-compose up -d usuarios postgres
```

## ⚙️ Configuración

Crea un archivo `.env` en la raíz del proyecto:

```env
# Servidor
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Base de Datos PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_password_seguro
DB_NAME=usuarios_db

# JWT
JWT_SECRET=tu_secreto_super_seguro_cambiame_en_produccion
JWT_EXPIRES_IN=7d
```

⚠️ **IMPORTANTE**: Cambia `JWT_SECRET` por un valor aleatorio y seguro en producción.

## 🎯 Uso

### Servidor Local

Una vez iniciado, el servidor estará disponible en:

- **API Base**: `http://localhost:3001/api/usuarios`
- **Swagger UI**: `http://localhost:3001/api-docs`
- **Health Check**: `http://localhost:3001/api/usuarios/me` (requiere autenticación)

## 📡 Endpoints API

### Públicos (sin autenticación)

#### `POST /api/usuarios/register`
Registrar un nuevo usuario.

**Request:**
```json
{
  "nombre": "Juan Pérez",
  "email": "juan@example.com",
  "password": "password123"
}
```

**Response (201):**
```json
{
  "id": 1,
  "nombre": "Juan Pérez",
  "email": "juan@example.com"
}
```

#### `POST /api/usuarios/login`
Iniciar sesión y obtener token JWT.

**Request:**
```json
{
  "email": "juan@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Protegidos (requieren autenticación)

> 🔒 Todos los endpoints siguientes requieren el header: `Authorization: Bearer <token>`

#### `GET /api/usuarios/me`
Obtener información del usuario autenticado.

**Response (200):**
```json
{
  "id": 1,
  "nombre": "Juan Pérez",
  "email": "juan@example.com",
  "is_admin": false
}
```

#### `POST /api/usuarios/favoritos`
Añadir una estación de servicio a favoritos.

**Request:**
```json
{
  "ideess": "12345"
}
```

**Response (201):**
```json
{
  "message": "Favorito añadido.",
  "ideess": "12345"
}
```

#### `GET /api/usuarios/favoritos`
Obtener lista de favoritos del usuario.

**Response (200):**
```json
[
  {
    "ideess": "12345",
    "created_at": "2025-10-22T19:30:00.000Z"
  },
  {
    "ideess": "67890",
    "created_at": "2025-10-21T15:20:00.000Z"
  }
]
```

### Admin (requieren rol de administrador)

#### `GET /api/usuarios/`
Listar todos los usuarios (solo administradores).

**Response (200):**
```json
[
  {
    "id": 1,
    "nombre": "Juan Pérez",
    "email": "juan@example.com",
    "is_admin": false
  },
  {
    "id": 2,
    "nombre": "Admin",
    "email": "admin@example.com",
    "is_admin": true
  }
]
```

## 🔐 Autenticación

Este microservicio usa **JWT (JSON Web Tokens)** para autenticación.

### Flujo de Autenticación

1. **Registro**: El usuario se registra con `POST /register`
2. **Login**: El usuario hace login con `POST /login` y recibe un token
3. **Uso del Token**: El token se envía en cada petición protegida

### Formato del Token

```http
Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Payload del Token

```json
{
  "id": 1,
  "email": "juan@example.com",
  "nombre": "Juan Pérez",
  "is_admin": false,
  "iat": 1729622400,
  "exp": 1730227200
}
```

### Expiración

Los tokens expiran según la configuración `JWT_EXPIRES_IN` (por defecto: 7 días).

## 🗄️ Base de Datos

### Esquema PostgreSQL

#### Tabla `users`

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Tabla `user_favorites`

```sql
CREATE TABLE user_favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ideess VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, ideess)
);
```

### Inicializar Base de Datos

```bash
# Ejecutar script de inicialización
psql -U postgres -d usuarios_db < init.sql

# O con Docker
docker exec -i postgres psql -U postgres -d usuarios_db < init.sql
```

## 🧪 Testing con Swagger

### Acceder a Swagger UI

Abre tu navegador en: `http://localhost:3001/api-docs`

### Probar Endpoints Protegidos

1. **Haz Login**:
   - Ve a `POST /api/usuarios/login`
   - Ejecuta con credenciales válidas
   - **Copia el token** de la respuesta

2. **Autorizar en Swagger**:
   - Haz clic en el botón **"Authorize"** 🔓 (esquina superior derecha)
   - Pega: `TU_TOKEN_AQUI`
   - Haz clic en "Authorize"
   - Cierra el modal

3. **Probar Endpoints**:
   - Ahora todos los endpoints protegidos (con candado 🔒) funcionarán
   - Prueba `GET /api/usuarios/me` para verificar

## 🐳 Despliegue con Docker

### Docker Compose

Ver archivo `docker-compose.yml` en la raíz del proyecto.

```bash
# Levantar todos los servicios
docker-compose up -d

# Ver logs
docker logs -f usuarios-service

# Detener
docker-compose down
```

## 📊 Códigos de Estado HTTP

| Código | Descripción |
|--------|-------------|
| 200 | ✅ OK - Solicitud exitosa |
| 201 | ✅ Created - Recurso creado |
| 400 | ❌ Bad Request - Datos inválidos |
| 401 | ❌ Unauthorized - Token inválido o ausente |
| 403 | ❌ Forbidden - Sin permisos (no admin) |
| 500 | ❌ Internal Server Error - Error del servidor |

## 🔒 Seguridad

- ✅ Contraseñas hasheadas con bcrypt (10 rounds)
- ✅ Tokens JWT firmados con secreto
- ✅ Validación de entrada con JSON Schema
- ✅ Headers de seguridad con Helmet
- ✅ Prevención de duplicados en favoritos
- ✅ Protección contra SQL injection (queries parametrizadas)
- ⚠️ **No olvides cambiar JWT_SECRET en producción**

---

**Desarrollado con ❤️ para el proyecto TankGo**