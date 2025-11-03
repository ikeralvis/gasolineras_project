# 🛡️ Microservicio de Usuarios - Actualizado

Microservicio de autenticación y gestión de usuarios con seguridad mejorada.

## 🚀 Características

- ✅ **Autenticación JWT** con validación robusta
- ✅ **CRUD de usuarios** (registro, login, perfil, actualización, eliminación)
- ✅ **Gestión de favoritos** (gasolineras)
- ✅ **Rate Limiting** (protección contra fuerza bruta)
- ✅ **CORS configurado** con whitelist
- ✅ **Validación de contraseñas fuertes** (8+ chars, mayúsculas, minúsculas, números, símbolos)
- ✅ **OpenAPI/Swagger** documentación automática
- ✅ **Healthchecks** (/health, /ready, /live)
- ✅ **Error handling centralizado**
- ✅ **Docker optimizado** (multi-stage, alpine, non-root user)

## 📋 Requisitos de Contraseña

Las contraseñas deben cumplir:
- Mínimo 8 caracteres
- Al menos una mayúscula
- Al menos una minúscula
- Al menos un número
- Al menos un carácter especial (!@#$%^&*...)

## 🔧 Configuración

### Variables de Entorno Requeridas

```bash
# Base de datos
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_password
DB_NAME=usuarios_db

# JWT (CRÍTICO: mínimo 32 caracteres)
JWT_SECRET=tu_secreto_jwt_muy_largo_y_seguro
JWT_EXPIRES_IN=7d

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Puerto
PORT=3001
```

### Generar JWT_SECRET seguro

```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## 📡 Endpoints

### Autenticación (Auth)

| Método | Ruta | Auth | Rate Limit | Descripción |
|--------|------|------|------------|-------------|
| POST | `/api/usuarios/register` | ❌ | 5/15min | Registrar usuario |
| POST | `/api/usuarios/login` | ❌ | 5/15min | Iniciar sesión |
| GET | `/api/usuarios/me` | ✅ | - | Ver perfil |
| PATCH | `/api/usuarios/me` | ✅ | - | Actualizar perfil |
| DELETE | `/api/usuarios/me` | ✅ | - | Eliminar cuenta |
| GET | `/api/usuarios/` | ✅ Admin | - | Listar usuarios |

### Favoritos

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/usuarios/favoritos` | ✅ | Añadir favorito |
| GET | `/api/usuarios/favoritos` | ✅ | Listar favoritos |
| DELETE | `/api/usuarios/favoritos/:ideess` | ✅ | Eliminar favorito |

### Healthchecks

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado completo (DB + uptime) |
| GET | `/ready` | Readiness probe (Kubernetes) |
| GET | `/live` | Liveness probe (Kubernetes) |

## 📚 Documentación API

Una vez iniciado el servidor:
- **Swagger UI**: http://localhost:3001/api-docs
- **OpenAPI JSON**: http://localhost:3001/documentation/json

## 🏃 Ejecución

### Con Docker (Recomendado)

```bash
# Construir e iniciar todos los servicios
docker-compose up --build

# Solo el microservicio de usuarios
docker-compose up usuarios
```

### Desarrollo local

```bash
cd usuarios-service

# Instalar dependencias
npm install

# Configurar variables de entorno
cp ../.env.example ../.env
# Editar .env con tus valores

# Ejecutar con hot reload
npm run dev

# Ejecutar en producción
npm start
```

## 🧪 Testing de Endpoints

### Registro de usuario

```bash
curl -X POST http://localhost:3001/api/usuarios/register \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Ana García",
    "email": "ana@example.com",
    "password": "MiPassword123!"
  }'
```

### Login

```bash
curl -X POST http://localhost:3001/api/usuarios/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ana@example.com",
    "password": "MiPassword123!"
  }'
```

### Ver perfil (con JWT)

```bash
curl -X GET http://localhost:3001/api/usuarios/me \
  -H "Authorization: Bearer TU_TOKEN_JWT"
```

### Healthcheck

```bash
curl http://localhost:3001/health
```

## 🔒 Seguridad Implementada

### Rate Limiting
- Login/Register: **5 intentos por 15 minutos**
- Global: **100 requests por 15 minutos**
- Headers de rate limit incluidos en respuestas

### CORS
- Orígenes permitidos configurables vía `ALLOWED_ORIGINS`
- Credentials habilitado para cookies/JWT
- Métodos HTTP específicos permitidos

### JWT
- Validación de `JWT_SECRET` al inicio (mínimo 32 chars)
- Expiración configurable (default: 7 días)
- Token incluye: id, email, nombre, is_admin

### Validaciones
- Email: RFC 5322 compliant
- Contraseñas: 8+ chars con complejidad
- SQL Injection: Queries parametrizadas
- XSS: Helmet configurado

### Docker
- Usuario no-root (`appuser`)
- Imagen alpine (ligera)
- Multi-stage build (sin dev dependencies)
- Healthcheck interno

## 📁 Estructura de Archivos

```
usuarios-service/
├── src/
│   ├── index.js                 # Entry point
│   ├── routes/
│   │   ├── auth.js              # Rutas de autenticación
│   │   ├── favorites.js         # Rutas de favoritos
│   │   └── health.js            # Healthchecks
│   ├── hooks/
│   │   └── authHooks.js         # verifyJwt, adminOnlyHook
│   ├── middlewares/
│   │   └── errorHandler.js      # Manejo global de errores
│   └── utils/
│       └── validators.js        # Validación de contraseñas/email
├── init.sql                     # DDL de PostgreSQL
├── Dockerfile                   # Optimizado (multi-stage)
└── package.json
```

## 🐛 Troubleshooting

### Error: JWT_SECRET no definido
```
❌ FATAL: JWT_SECRET no está definido en las variables de entorno
```
**Solución**: Definir `JWT_SECRET` en `.env` con mínimo 32 caracteres

### Error: Contraseña no cumple requisitos
```json
{
  "error": "La contraseña debe contener al menos un número."
}
```
**Solución**: Usar contraseña con mayúsculas, minúsculas, números y símbolos

### Error: Rate limit excedido
```json
{
  "error": "Demasiadas solicitudes",
  "retryAfter": "900"
}
```
**Solución**: Esperar 15 minutos o usar otro IP

### Healthcheck falla
```
Database connection failed
```
**Solución**: Verificar que PostgreSQL esté corriendo y las credenciales sean correctas

## 📊 Monitoreo

### Logs
Los logs están en formato JSON (Fastify logger):
```bash
docker logs -f usuarios-service
```

### Healthcheck
```bash
# Estado completo
curl http://localhost:3001/health

# Solo verificar si está listo
curl http://localhost:3001/ready

# Solo verificar si está vivo
curl http://localhost:3001/live
```

## 🔄 Próximas Mejoras

- [ ] Refresh tokens
- [ ] Tests unitarios/integración
- [ ] Soft deletes (campo deleted_at)
- [ ] Logging estructurado con Pino
- [ ] Prometheus metrics
- [ ] Rate limiting con Redis
- [ ] Email verification
- [ ] Password reset flow

## 📝 Changelog

### v1.1.0 (Noviembre 2025)
- ✅ Rate limiting en login/register
- ✅ CORS configurado
- ✅ Validación de contraseñas fuertes
- ✅ Healthchecks (/health, /ready, /live)
- ✅ Error handler centralizado
- ✅ Dockerfile optimizado (alpine, multi-stage)
- ✅ Validación de JWT_SECRET
- ✅ Email lowercase normalizado
- ✅ Sanitización de nombres

### v1.0.0 (Inicial)
- Autenticación JWT básica
- CRUD de usuarios
- Gestión de favoritos
- OpenAPI/Swagger

## 👥 Contacto

Para reportar bugs o sugerir mejoras, abre un issue en el repositorio.

---

**Nota**: Este microservicio forma parte de un sistema de microservicios más grande que incluye gasolineras-service, gateway-hono y frontend-client.
