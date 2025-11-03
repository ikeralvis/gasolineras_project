# 🔐 Microservicio de Usuarios

Microservicio de autenticación y gestión de usuarios con JWT, construido con **Fastify** y **PostgreSQL**.

---

## 🚀 Tecnologías

- **Node.js 20** + **Fastify** (framework rápido y moderno)
- **PostgreSQL 16** (base de datos relacional)
- **JWT** (autenticación con tokens)
- **bcryptjs** (hash seguro de contraseñas)
- **Swagger/OpenAPI** (documentación interactiva)
- **Docker** (contenedorización)

---

## ✨ Características

✅ Registro y autenticación de usuarios  
✅ Tokens JWT con expiración configurable  
✅ Gestión de favoritos (gasolineras)  
✅ Control de acceso por roles (admin)  
✅ Documentación Swagger UI automática  
✅ Validación de datos con JSON Schema  
✅ Seguridad con Helmet y bcrypt  

---

## 📦 Instalación

### Con Docker (Recomendado)
```bash
# Desde la raíz del proyecto
docker-compose up -d usuarios postgres
```

### Manual (Desarrollo Local)
```bash
cd usuarios-service
npm install

# Copiar y configurar variables de entorno
cp .env.example .env
# Edita .env con tus credenciales

npm run dev
```

---

## ⚙️ Variables de Entorno

Crea un archivo `.env` basado en `.env.example`:

```env
# Servidor
PORT=3001
HOST=0.0.0.0

# PostgreSQL (usar 'postgres' en Docker, 'localhost' en local)
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_password
DB_NAME=usuarios_db

# JWT (⚠️ cambiar en producción)
JWT_SECRET=cambiar_por_secreto_aleatorio_seguro
JWT_EXPIRES_IN=7d
```

**⚠️ IMPORTANTE**: Genera un `JWT_SECRET` seguro con:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 🌐 Endpoints Principales

### 📄 Documentación
- **Swagger UI**: http://localhost:3001/api-docs
- **Health Check**: `GET /api/usuarios/health`

### 🔓 Públicos (sin autenticación)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/usuarios/register` | Registrar usuario |
| POST | `/api/usuarios/login` | Login (devuelve JWT) |

### 🔒 Protegidos (requieren token JWT)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/usuarios/me` | Obtener perfil |
| PATCH | `/api/usuarios/me` | Actualizar perfil |
| DELETE | `/api/usuarios/me` | Eliminar cuenta |
| GET | `/api/usuarios/favoritos` | Listar favoritos |
| POST | `/api/usuarios/favoritos` | Añadir favorito |
| DELETE | `/api/usuarios/favoritos/:ideess` | Eliminar favorito |

### 👑 Admin (requieren rol admin)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/usuarios/` | Listar todos los usuarios |

---

## 🔐 Autenticación

### Flujo Básico
```bash
# 1. Registro
curl -X POST http://localhost:3001/api/usuarios/register \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Juan","email":"juan@test.com","password":"123456"}'

# 2. Login (obtener token)
curl -X POST http://localhost:3001/api/usuarios/login \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@test.com","password":"123456"}'
  
# Respuesta: {"token":"eyJhbG..."}

# 3. Usar token en peticiones protegidas
curl http://localhost:3001/api/usuarios/me \
  -H "Authorization: Bearer eyJhbG..."
```

---

## 🗄️ Base de Datos

### Tablas

#### `users`
```sql
- id (SERIAL PRIMARY KEY)
- nombre (VARCHAR)
- email (VARCHAR UNIQUE)
- password_hash (VARCHAR)
- is_admin (BOOLEAN)
- created_at (TIMESTAMP)
```

#### `user_favorites`
```sql
- id (SERIAL PRIMARY KEY)
- user_id (FK → users.id)
- ideess (VARCHAR) -- ID de gasolinera
- created_at (TIMESTAMP)
- UNIQUE(user_id, ideess)
```

La base de datos se inicializa automáticamente con `init.sql` al levantar Docker.

---

## 🧪 Probar con Swagger

1. Abre http://localhost:3001/api-docs
2. Ejecuta `POST /login` con credenciales válidas
3. Copia el token de la respuesta
4. Haz clic en **"Authorize"** 🔓 (arriba a la derecha)
5. Pega el token y haz clic en "Authorize"
6. Ahora puedes probar todos los endpoints protegidos 🔒

---

## 📊 Códigos de Respuesta

| Código | Significado |
|--------|-------------|
| 200 | ✅ OK |
| 201 | ✅ Creado |
| 400 | ❌ Datos inválidos |
| 401 | ❌ No autenticado |
| 403 | ❌ Sin permisos (no admin) |
| 404 | ❌ No encontrado |
| 500 | ❌ Error del servidor |

---

## 🔒 Seguridad

- ✅ Contraseñas hasheadas con bcrypt (10 rounds)
- ✅ Tokens JWT firmados
- ✅ Validación de entrada (JSON Schema)
- ✅ Headers de seguridad (Helmet)
- ✅ Queries parametrizadas (prevención SQL injection)
- ✅ CORS configurado
- ⚠️ Cambiar `JWT_SECRET` en producción

---

## 🐳 Docker

```bash
# Ver logs
docker logs -f usuarios-service

# Acceder al contenedor
docker exec -it usuarios-service sh

# Reiniciar servicio
docker-compose restart usuarios
```

---

## 📝 Estructura del Proyecto

```
usuarios-service/
├── src/
│   ├── index.js          # Servidor principal
│   ├── db.js             # Plugin de PostgreSQL
│   ├── routes/
│   │   ├── auth.js       # Rutas de autenticación
│   │   └── favorites.js  # Rutas de favoritos
│   └── hooks/
│       └── authHooks.js  # Middleware de autorización
├── init.sql              # Schema de la BD
├── Dockerfile
├── package.json
├── .env.example
└── README.MD
```

---

## 🔗 Integración con Gateway

Este microservicio está diseñado para funcionar detrás del **API Gateway**:

```
Cliente → Gateway:8080 → /api/usuarios/* → usuarios-service:3001
```

El gateway reenvía automáticamente los headers de autenticación.

---

**💡 Tip**: Para más ejemplos de uso, revisa la documentación del Gateway en `/gateway-hono/EXAMPLES.md`