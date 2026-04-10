# 🚀 API Gateway - TankGo

El **API Gateway** es el punto de entrada único para la aplicación TankGo. Centraliza y gestiona las solicitudes hacia los microservicios de usuarios, gasolineras (incluyendo EV integrado), recomendación y predicción (cuando aplica), proporcionando una capa adicional de seguridad, abstracción y monitoreo.

---

## 🌟 Características

- **Proxy centralizado**: Redirige solicitudes a los microservicios correspondientes.
- **Documentación OpenAPI**: Generada automáticamente para explorar y probar los endpoints.
- **Health checks**: Verifica el estado del gateway y los microservicios conectados.
- **CORS configurado**: Permite peticiones seguras desde el frontend.
- **Manejo de errores**: Respuestas consistentes y centralizadas.
- **Logging**: Registro de todas las solicitudes para monitoreo.

---

## 🔐 Seguridad Recomendada

- El gateway establece sesion con cookie `httpOnly` (`authToken`) tras login.
- El frontend debe enviar peticiones autenticadas con `credentials: include`.
- El proxy de usuarios puede inyectar `Authorization: Bearer <cookie>` para compatibilidad con `usuarios-service`.
- `POST /api/auth/logout` limpia la cookie de sesion.
- `POST /api/gasolineras/sync` requiere `X-Internal-Secret` y esta pensado para uso interno.

### Variables Clave para Cloud

```env
FRONTEND_URL=https://tu-frontend.example.com
FRONTEND_URLS=https://tu-frontend.example.com,https://admin.tu-frontend.example.com
GATEWAY_PUBLIC_URL=https://tu-gateway.example.com
USUARIOS_SERVICE_URL=https://usuarios.internal
GASOLINERAS_SERVICE_URL=https://gasolineras.internal
RECOMENDACION_SERVICE_URL=https://recomendacion.internal
ORS_BASE_URL=https://api.openrouteservice.org
ORS_API_KEY=tu_api_key_ors
OSRM_BASE_URL=http://router.project-osrm.org
ROUTING_TIMEOUT_MS=10000
ROUTING_RETRIES=2
# Opcional:
# PREDICTION_SERVICE_URL=https://prediction.internal
INTERNAL_API_SECRET=un-secreto-largo-y-unico
NODE_ENV=production
OPENAPI_RETRY_MS=10000
OPENAPI_REFRESH_MS=300000
```

Notas:
- Usa HTTPS extremo a extremo para que `Secure` cookies funcionen en navegador.
- Manten `INTERNAL_API_SECRET` igual en gateway y servicios internos que validan sincronizacion.
- El gateway reintenta cargar OpenAPI mientras falte algun servicio requerido y refresca periodicamente la especificacion agregada.

---

## 📋 Endpoints Principales

### Información del Gateway

| Método | Endpoint       | Descripción                              |
|--------|----------------|------------------------------------------|
| GET    | `/`            | Información general del gateway.         |
| GET    | `/health`      | Verifica el estado del gateway y servicios conectados. |
| GET    | `/docs`        | Accede a la documentación Swagger UI.    |
| GET    | `/openapi.json`| Descarga la especificación OpenAPI.      |

**Ejemplo:**
```bash
# Verificar estado del gateway
curl http://localhost:8080/health

# Acceder a la documentación interactiva
http://localhost:8080/docs
```

---

## 🔗 Proxy a Microservicios

### Usuarios

El gateway redirige las solicitudes relacionadas con usuarios al microservicio `usuarios-service`.

| Método | Endpoint                   | Descripción                  |
|--------|----------------------------|------------------------------|
| POST   | `/api/usuarios/register`   | Registrar un nuevo usuario.  |
| POST   | `/api/usuarios/login`      | Iniciar sesión.              |
| GET    | `/api/usuarios/favoritos`  | Obtener favoritos (requiere auth). |
| POST   | `/api/usuarios/favoritos`  | Agregar un favorito (requiere auth). |
| DELETE | `/api/usuarios/favoritos/:id` | Eliminar un favorito (requiere auth). |
| GET    | `/api/usuarios/health`     | Health check de usuarios (mapeado a `/health` real). |
| GET    | `/api/usuarios/ready`      | Readiness de usuarios (mapeado a `/ready`). |
| GET    | `/api/usuarios/live`       | Liveness de usuarios (mapeado a `/live`). |

### Gasolineras

El gateway redirige las solicitudes relacionadas con gasolineras al microservicio `gasolineras-service`.

| Método | Endpoint       | Descripción                              |
|--------|----------------|------------------------------------------|
| GET    | `/api/gasolineras` | Obtener todas las gasolineras.         |

### Recomendación

| Método | Endpoint                                | Descripción                           |
|--------|-----------------------------------------|---------------------------------------|
| ALL    | `/api/recomendacion/*`                  | Proxy canónico hacia recomendación.   |
| ALL    | `/api/recomendaciones/*`                | Alias compatible.                     |

### Routing externo (gestionado por Gateway)

| Método | Endpoint                  | Descripción |
|--------|---------------------------|-------------|
| POST   | `/api/routing/directions`| Calcula ruta (A->B o con waypoints), soporta `avoid_tolls`. |
| POST   | `/api/routing/matrix`    | Calcula matriz de tiempos en una sola llamada (ORS). |

### EV Charging

| Método | Endpoint                                | Descripción                           |
|--------|-----------------------------------------|---------------------------------------|
| ALL    | `/api/charging/*`                       | Proxy EV integrado en `gasolineras-service`. |

### Prediction

| Método | Endpoint                                | Descripción                           |
|--------|-----------------------------------------|---------------------------------------|
| ALL    | `/api/prediction/*`                     | Proxy a predicción (si está configurado). |

---

## 🏥 Health Check

El endpoint `/health` verifica el estado del gateway y la conectividad con los microservicios:

```json
{
  "status": "UP",
  "timestamp": "2025-11-20T12:00:00.000Z",
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

Adicionalmente, el gateway expone health/readiness/liveness de usuarios en:

- `/api/usuarios/health`
- `/api/usuarios/ready`
- `/api/usuarios/live`

---

## 📖 Documentación Interactiva

El gateway genera automáticamente documentación interactiva para explorar y probar los endpoints:

- **Swagger UI**: [http://localhost:8080/docs](http://localhost:8080/docs)
- **OpenAPI JSON**: [http://localhost:8080/openapi.json](http://localhost:8080/openapi.json)

---

## 🚀 Ejecución

### Desarrollo
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

---

## 🌐 Ventajas del Gateway

1. **Punto de entrada único**: Simplifica la interacción del cliente con los microservicios.
2. **Seguridad centralizada**: CORS, autenticación y manejo de errores.
3. **Monitoreo**: Health checks para verificar el estado de los servicios.
4. **Documentación unificada**: OpenAPI centralizada para todos los endpoints.
5. **Abstracción**: Cambios internos en los microservicios no afectan al cliente.

---

Desarrollado con ❤️ para el proyecto TankGo.
