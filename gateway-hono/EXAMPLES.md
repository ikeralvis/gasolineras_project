# 🧪 Ejemplos de Peticiones - API Gateway

Colección de ejemplos para probar el API Gateway usando `curl` o herramientas como Postman/Insomnia.

## 🌍 Variables

```bash
GATEWAY_URL=http://localhost:8080
```

---

## 📍 Endpoints Generales

### 1. Información del Gateway
```bash
curl http://localhost:8080/
```

**Respuesta:**
```json
{
  "message": "🚀 API Gateway - Gasolineras",
  "version": "1.0.0",
  "documentation": "http://localhost:8080/docs",
  "endpoints": {
    "health": "/health",
    "usuarios": "/api/usuarios/*",
    "gasolineras": "/api/gasolineras"
  }
}
```

### 2. Health Check
```bash
curl http://localhost:8080/health
```

**Respuesta:**
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

### 3. Documentación OpenAPI
```bash
# Ver spec OpenAPI en JSON
curl http://localhost:8080/openapi.json

# Abrir Swagger UI en navegador
open http://localhost:8080/docs
```

---

## 👤 Usuarios

### 1. Registrar Usuario
```bash
curl -X POST http://localhost:8080/api/usuarios/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "juan@example.com",
    "password": "password123",
    "nombre": "Juan Pérez"
  }'
```

**Respuesta (201):**
```json
{
  "message": "Usuario creado exitosamente",
  "userId": 1
}
```

### 2. Login
```bash
curl -X POST http://localhost:8080/api/usuarios/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "juan@example.com",
    "password": "password123"
  }'
```

**Respuesta (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "juan@example.com",
    "nombre": "Juan Pérez"
  }
}
```

**💡 Guarda el token para las siguientes peticiones autenticadas**

---

## ⭐ Favoritos

### 1. Obtener Favoritos del Usuario
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl http://localhost:8080/api/usuarios/favorites \
  -H "Authorization: Bearer $TOKEN"
```

**Respuesta (200):**
```json
[
  {
    "id": 1,
    "userId": 1,
    "gasolineraId": "12345",
    "createdAt": "2025-10-27T10:00:00.000Z"
  }
]
```

### 2. Agregar Favorito
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X POST http://localhost:8080/api/usuarios/favorites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gasolineraId": "67890"
  }'
```

**Respuesta (201):**
```json
{
  "message": "Favorito agregado",
  "favoriteId": 2
}
```

### 3. Eliminar Favorito
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X DELETE http://localhost:8080/api/usuarios/favorites/2 \
  -H "Authorization: Bearer $TOKEN"
```

**Respuesta (200):**
```json
{
  "message": "Favorito eliminado"
}
```

---

## ⛽ Gasolineras

### 1. Obtener Todas las Gasolineras
```bash
curl http://localhost:8080/api/gasolineras
```

**Respuesta (200):**
```json
[
  {
    "id": "12345",
    "nombre": "Repsol Centro",
    "direccion": "Calle Mayor 1",
    "precio_gasolina": 1.45,
    "precio_diesel": 1.35
  },
  {
    "id": "67890",
    "nombre": "Cepsa Norte",
    "direccion": "Avenida del Norte 50",
    "precio_gasolina": 1.42,
    "precio_diesel": 1.32
  }
]
```

---

## 🧪 Pruebas Completas

### Flujo Completo de Usuario

```bash
# 1. Registrar usuario
curl -X POST http://localhost:8080/api/usuarios/register \
  -H "Content-Type: application/json" \
  -d '{"email": "maria@example.com", "password": "123456", "nombre": "María"}'

# 2. Login
RESPONSE=$(curl -s -X POST http://localhost:8080/api/usuarios/login \
  -H "Content-Type: application/json" \
  -d '{"email": "maria@example.com", "password": "123456"}')

# 3. Extraer token (requiere jq)
TOKEN=$(echo $RESPONSE | jq -r '.token')
echo "Token: $TOKEN"

# 4. Ver gasolineras
curl http://localhost:8080/api/gasolineras

# 5. Agregar favorito
curl -X POST http://localhost:8080/api/usuarios/favorites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"gasolineraId": "12345"}'

# 6. Ver mis favoritos
curl http://localhost:8080/api/usuarios/favorites \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🐛 Pruebas de Errores

### 1. Ruta No Encontrada (404)
```bash
curl http://localhost:8080/api/ruta-inexistente
```

**Respuesta:**
```json
{
  "error": "Ruta no encontrada",
  "path": "/api/ruta-inexistente",
  "method": "GET",
  "message": "La ruta solicitada no existe en el Gateway"
}
```

### 2. Sin Token de Autenticación (401)
```bash
curl http://localhost:8080/api/usuarios/favorites
```

**Respuesta:**
```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "No token provided"
}
```

### 3. Credenciales Inválidas (401)
```bash
curl -X POST http://localhost:8080/api/usuarios/login \
  -H "Content-Type: application/json" \
  -d '{"email": "wrong@example.com", "password": "wrongpass"}'
```

---

## 🔧 PowerShell (Windows)

Si usas PowerShell en Windows, usa `Invoke-RestMethod`:

### Ejemplo de Login
```powershell
$body = @{
    email = "juan@example.com"
    password = "password123"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8080/api/usuarios/login" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"

$token = $response.token
Write-Host "Token: $token"
```

### Ejemplo con Token
```powershell
$headers = @{
    Authorization = "Bearer $token"
}

Invoke-RestMethod -Uri "http://localhost:8080/api/usuarios/favorites" `
    -Headers $headers
```

---

## 📦 Colección Postman

Puedes importar estas peticiones en Postman:

1. Crea una nueva colección
2. Añade una variable de entorno `gateway_url` = `http://localhost:8080`
3. Añade las peticiones usando `{{gateway_url}}/api/...`
4. Crea una variable `auth_token` que se actualice automáticamente tras el login

---

## 🎯 Testing Automatizado

### Con Node.js y fetch
```javascript
// test-gateway.js
async function testGateway() {
  const BASE_URL = 'http://localhost:8080';
  
  // 1. Health check
  const health = await fetch(`${BASE_URL}/health`);
  console.log('Health:', await health.json());
  
  // 2. Login
  const loginRes = await fetch(`${BASE_URL}/api/usuarios/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@test.com', password: '123456' })
  });
  const { token } = await loginRes.json();
  
  // 3. Get favorites
  const favs = await fetch(`${BASE_URL}/api/usuarios/favorites`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Favoritos:', await favs.json());
}

testGateway();
```
