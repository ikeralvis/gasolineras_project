# 🚀 API Gateway - TankGo

El **API Gateway** es el punto de entrada único para la aplicación TankGo. Centraliza y gestiona las solicitudes hacia los microservicios de usuarios y gasolineras, proporcionando una capa adicional de seguridad, abstracción y monitoreo.

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
INTERNAL_API_SECRET=un-secreto-largo-y-unico
NODE_ENV=production
```

Notas:
- Usa HTTPS extremo a extremo para que `Secure` cookies funcionen en navegador.
- Manten `INTERNAL_API_SECRET` igual en gateway y servicios internos que validan sincronizacion.

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
| GET    | `/api/usuarios/favorites`  | Obtener favoritos (requiere auth). |
| POST   | `/api/usuarios/favorites`  | Agregar un favorito (requiere auth). |
| DELETE | `/api/usuarios/favorites/:id` | Eliminar un favorito (requiere auth). |

### Gasolineras

El gateway redirige las solicitudes relacionadas con gasolineras al microservicio `gasolineras-service`.

| Método | Endpoint       | Descripción                              |
|--------|----------------|------------------------------------------|
| GET    | `/api/gasolineras` | Obtener todas las gasolineras.         |

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
