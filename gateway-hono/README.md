# 🚀 API Gateway - Gasolineras

Gateway centralizado construido con **Hono.js** que actúa como punto de entrada único para todos los microservicios de la aplicación de gasolineras.

## 📋 Características

- ✅ **API REST completa** con todos los métodos HTTP (GET, POST, PUT, DELETE, PATCH)
- ✅ **Documentación OpenAPI 3.1** integrada con Swagger UI
- ✅ **CORS** configurado para desarrollo
- ✅ **Proxy inteligente** hacia microservicios
- ✅ **Health checks** para monitorear servicios
- ✅ **Manejo de errores** robusto
- ✅ **Logging** de todas las peticiones
- ✅ **Timeout protection** en health checks

## 🏗️ Arquitectura

```
┌─────────────┐
│   Cliente   │
│  (Frontend) │
└──────┬──────┘
       │
       │ HTTP Request
       ▼
┌─────────────────────────┐
│   API GATEWAY (Hono)    │
│   Puerto: 8080          │
└───┬─────────────────┬───┘
    │                 │
    │ Proxy           │ Proxy
    ▼                 ▼
┌──────────┐    ┌──────────────┐
│ Usuarios │    │ Gasolineras  │
│ :3001    │    │ :8000        │
│ (Node.js)│    │ (FastAPI)    │
└──────────┘    └──────────────┘
```

## 📦 Instalación

```bash
cd gateway-hono
npm install
```

## 🚀 Ejecución

### Desarrollo (con auto-reload)
```bash
npm run dev
```

### Producción
```bash
npm start
```

### Con Docker
```bash
docker-compose up gateway
```

## 🔗 Endpoints Principales

### Información del Gateway
- `GET /` - Información general y endpoints disponibles
- `GET /health` - Estado del gateway y microservicios
- `GET /docs` - Documentación Swagger UI interactiva
- `GET /openapi.json` - Especificación OpenAPI en formato JSON

### Usuarios (Proxy a `usuarios-service`)
- `POST /api/usuarios/register` - Registrar nuevo usuario
- `POST /api/usuarios/login` - Iniciar sesión
- `GET /api/usuarios/favorites` - Obtener favoritos (requiere auth)
- `POST /api/usuarios/favorites` - Agregar favorito (requiere auth)
- `DELETE /api/usuarios/favorites/:id` - Eliminar favorito (requiere auth)

### Gasolineras (Proxy a `gasolineras-service`)
- `GET /api/gasolineras` - Obtener todas las gasolineras

## 🔐 Autenticación

El gateway reenvía el header `Authorization` a los microservicios que lo requieren.

```bash
# Ejemplo de petición autenticada
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:8080/api/usuarios/favorites
```

## 📚 Documentación API (OpenAPI/Swagger)

Una vez iniciado el servidor, accede a:

**📄 http://localhost:8080/docs**

Aquí encontrarás:
- Todos los endpoints disponibles
- Esquemas de request/response
- Posibilidad de probar las APIs directamente
- Ejemplos de uso

## 🏥 Health Check

El endpoint `/health` verifica:
- Estado del gateway
- Conectividad con el servicio de usuarios
- Conectividad con el servicio de gasolineras

```json
{
  "status": "UP",
  "timestamp": "2025-10-27T12:00:00.000Z",
  "services": {
    "usuarios": {
      "status": "UP",
      "url": "http://usuarios:3001"
    },
    "gasolineras": {
      "status": "UP",
      "url": "http://gasolineras:8000"
    }
  }
}
```

## ⚙️ Variables de Entorno

```env
PORT=8080
USUARIOS_SERVICE_URL=http://usuarios:3001
GASOLINERAS_SERVICE_URL=http://gasolineras:8000
```

## 🛡️ Middlewares

1. **Logger**: Registra todas las peticiones
2. **CORS**: Permite peticiones cross-origin
3. **Error Handler**: Manejo centralizado de errores

## 🔀 Funcionamiento del Proxy

El gateway reenvía las peticiones manteniendo:
- ✅ Método HTTP original (GET, POST, etc.)
- ✅ Headers (excepto `host`)
- ✅ Body de la petición
- ✅ Query parameters
- ✅ Status codes de respuesta
- ✅ Content-Type

## 📝 Ejemplo de Uso

### Desde el Frontend

```javascript
// Todas las peticiones van al gateway
const API_BASE = 'http://localhost:8080';

// Login
const response = await fetch(`${API_BASE}/api/usuarios/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: '123456' })
});

// Obtener gasolineras
const gasolineras = await fetch(`${API_BASE}/api/gasolineras`);
```

## 🎯 Ventajas del Gateway

1. **Punto de entrada único**: El cliente solo necesita conocer la URL del gateway
2. **Abstracción de servicios**: Los cambios internos no afectan al cliente
3. **Seguridad centralizada**: CORS, autenticación, rate limiting (futuro)
4. **Logging unificado**: Todas las peticiones pasan por un punto
5. **Monitoreo**: Health checks de todos los servicios
6. **Documentación única**: OpenAPI centralizada

## 🚧 Próximas Mejoras

- [ ] Rate limiting
- [ ] Caché de respuestas
- [ ] Autenticación en el gateway
- [ ] Métricas y observabilidad
- [ ] Load balancing
- [ ] Circuit breaker

## 🤝 API Programática

Sí, exactamente. Una **API programática** significa:

1. **Bien documentada** ✅ - OpenAPI/Swagger
2. **Predecible** ✅ - REST estándar
3. **Versionada** ✅ - En el spec OpenAPI
4. **Fácil de consumir** ✅ - JSON, HTTP estándar
5. **Auto-descriptiva** ✅ - Documentación interactiva

El estándar **OpenAPI** (antes Swagger) es el más usado para documentar APIs REST.
