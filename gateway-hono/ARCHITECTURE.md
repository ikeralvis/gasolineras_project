# 🏗️ Arquitectura del API Gateway

## Flujo de Peticiones

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE (Frontend)                       │
│                         React / Vite                             │
│                     http://localhost:5173                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTP/HTTPS Request
                            │ (GET, POST, PUT, DELETE)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     🚪 API GATEWAY (Hono.js)                     │
│                     http://localhost:8080                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Middlewares                                            │    │
│  │  • Logger (registra todas las peticiones)             │    │
│  │  • CORS (permite cross-origin)                        │    │
│  │  • Error Handler (manejo de errores global)           │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Rutas Públicas                                         │    │
│  │  GET  /              → Info del gateway                │    │
│  │  GET  /health        → Health check                    │    │
│  │  GET  /docs          → Swagger UI                      │    │
│  │  GET  /openapi.json  → Spec OpenAPI                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Proxy a Microservicios                                 │    │
│  │  /api/usuarios/*     → usuarios-service                │    │
│  │  /api/gasolineras/*  → gasolineras-service             │    │
│  └────────────────────────────────────────────────────────┘    │
└───────────────┬─────────────────────┬───────────────────────────┘
                │                     │
                │ Proxy               │ Proxy
                ▼                     ▼
    ┌───────────────────────┐  ┌──────────────────────┐
    │  USUARIOS SERVICE     │  │ GASOLINERAS SERVICE  │
    │  (Node.js/Fastify)    │  │  (Python/FastAPI)    │
    │  :3001                │  │  :8000               │
    │                       │  │                      │
    │  • POST /register     │  │  • GET /gasolineras  │
    │  • POST /login        │  │  • GET /:id          │
    │  • GET /favorites     │  │  • Futuros...        │
    │  • POST /favorites    │  │                      │
    │  • DELETE /favorites  │  │                      │
    └───────────┬───────────┘  └──────────┬───────────┘
                │                         │
                ▼                         ▼
        ┌──────────────┐          ┌──────────────┐
        │  PostgreSQL  │          │   MongoDB    │
        │  :5432       │          │   :27017     │
        └──────────────┘          └──────────────┘
```

## 📊 Especificación de Rutas

### Gateway → Usuarios Service

| Gateway Route                      | Método | Proxy a                          | Auth Required |
|------------------------------------|--------|----------------------------------|---------------|
| `/api/usuarios/register`           | POST   | `usuarios:3001/api/usuarios/register` | ❌         |
| `/api/usuarios/login`              | POST   | `usuarios:3001/api/usuarios/login`    | ❌         |
| `/api/usuarios/health`             | GET    | `usuarios:3001/api/usuarios/health`   | ❌         |
| `/api/usuarios/favorites`          | GET    | `usuarios:3001/api/usuarios/favorites` | ✅         |
| `/api/usuarios/favorites`          | POST   | `usuarios:3001/api/usuarios/favorites` | ✅         |
| `/api/usuarios/favorites/:id`      | DELETE | `usuarios:3001/api/usuarios/favorites/:id` | ✅    |

### Gateway → Gasolineras Service

| Gateway Route          | Método | Proxy a                    | Auth Required |
|------------------------|--------|----------------------------|---------------|
| `/api/gasolineras`     | GET    | `gasolineras:8000/gasolineras` | ❌         |
| `/api/gasolineras/:id` | GET    | `gasolineras:8000/:id`         | ❌         |

## 🔐 Flujo de Autenticación

```
┌─────────┐                ┌─────────┐              ┌──────────┐
│ Cliente │                │ Gateway │              │ Usuarios │
└────┬────┘                └────┬────┘              └────┬─────┘
     │                          │                        │
     │  POST /api/usuarios/login│                        │
     │ { email, password }      │                        │
     ├─────────────────────────>│                        │
     │                          │  POST /api/usuarios/login
     │                          │ { email, password }    │
     │                          ├───────────────────────>│
     │                          │                        │
     │                          │    { token, user }     │
     │                          │<───────────────────────┤
     │    { token, user }       │                        │
     │<─────────────────────────┤                        │
     │                          │                        │
     │                          │                        │
     │  GET /api/usuarios/favorites                      │
     │  Header: Authorization: Bearer <token>            │
     ├─────────────────────────>│                        │
     │                          │  GET /api/usuarios/favorites
     │                          │  Header: Authorization │
     │                          ├───────────────────────>│
     │                          │                        │
     │                          │      [favoritos]       │
     │                          │<───────────────────────┤
     │      [favoritos]         │                        │
     │<─────────────────────────┤                        │
     │                          │                        │
```

## 🔄 Manejo de Errores

```
Cliente ──┐
          │
          ▼
      Gateway ──┐
                │
                ├─> ✅ Servicio responde OK → 200-299
                │                              └─> Cliente recibe respuesta
                │
                ├─> ⚠️ Servicio responde error → 400-599
                │                                 └─> Gateway reenvía error
                │
                └─> ❌ Servicio no disponible → 503 Service Unavailable
                                                └─> Gateway devuelve error
```

## 📦 Tecnologías Utilizadas

| Componente         | Tecnología      | Puerto | Descripción                      |
|--------------------|-----------------|--------|----------------------------------|
| Gateway            | Hono.js         | 8080   | API Gateway + Proxy              |
| Usuarios Service   | Fastify         | 3001   | Autenticación y favoritos        |
| Gasolineras Service| FastAPI         | 8000   | Datos de gasolineras             |
| Frontend           | React + Vite    | 5173   | Interfaz de usuario              |
| DB Usuarios        | PostgreSQL      | 5432   | Base de datos relacional         |
| DB Gasolineras     | MongoDB         | 27017  | Base de datos NoSQL              |

## 🎯 Ventajas de esta Arquitectura

### ✅ Separación de Responsabilidades
- **Gateway**: Enrutamiento, CORS, logging
- **Usuarios**: Lógica de autenticación
- **Gasolineras**: Lógica de datos

### ✅ Escalabilidad
- Cada servicio puede escalar independientemente
- Posibilidad de múltiples instancias

### ✅ Mantenibilidad
- Código modular y desacoplado
- Fácil de testear

### ✅ Flexibilidad
- Cambiar un servicio no afecta a otros
- Tecnologías diferentes por servicio

### ✅ Seguridad
- CORS centralizado
- Posibilidad de añadir rate limiting
- Autenticación en capa única

## 🚀 Despliegue con Docker Compose

```yaml
services:
  gateway:
    build: ./gateway-hono
    ports:
      - "8080:8080"
    depends_on:
      - usuarios
      - gasolineras
    environment:
      - USUARIOS_SERVICE_URL=http://usuarios:3001
      - GASOLINERAS_SERVICE_URL=http://gasolineras:8000
```

El gateway se comunica con los servicios usando los **nombres de los contenedores** como hostnames (usuarios, gasolineras).

## 📈 Próximas Características

- [ ] **Rate Limiting**: Limitar peticiones por IP/Usuario
- [ ] **Caché**: Redis para respuestas frecuentes
- [ ] **Métricas**: Prometheus + Grafana
- [ ] **Circuit Breaker**: Prevenir cascadas de fallos
- [ ] **API Versioning**: `/v1/api/`, `/v2/api/`
- [ ] **WebSockets**: Para notificaciones en tiempo real
- [ ] **GraphQL Gateway**: Alternativa a REST
