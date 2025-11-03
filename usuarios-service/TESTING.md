# 🧪 Testing del Microservicio de Usuarios

Ejemplos de cómo probar el microservicio de usuarios.

---

## 📋 Variables de Entorno

```bash
# Configurar URL base
BASE_URL=http://localhost:3001
```

---

## 🔓 Endpoints Públicos

### 1. Registrar Usuario

```bash
curl -X POST $BASE_URL/api/usuarios/register \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Pérez",
    "email": "juan@example.com",
    "password": "password123"
  }'
```

**Respuesta:**
```json
{
  "id": 1,
  "nombre": "Juan Pérez",
  "email": "juan@example.com"
}
```

### 2. Login

```bash
curl -X POST $BASE_URL/api/usuarios/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "juan@example.com",
    "password": "password123"
  }'
```

**Respuesta:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 🔒 Endpoints Protegidos

**⚠️ Requieren token JWT en el header `Authorization: Bearer <token>`**

### 3. Obtener Perfil

```bash
TOKEN="tu_token_aqui"

curl $BASE_URL/api/usuarios/me \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Actualizar Perfil

```bash
curl -X PATCH $BASE_URL/api/usuarios/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Actualizado"
  }'
```

### 5. Añadir Favorito

```bash
curl -X POST $BASE_URL/api/usuarios/favoritos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ideess": "12345"
  }'
```

### 6. Listar Favoritos

```bash
curl $BASE_URL/api/usuarios/favoritos \
  -H "Authorization: Bearer $TOKEN"
```

### 7. Eliminar Favorito

```bash
curl -X DELETE $BASE_URL/api/usuarios/favoritos/12345 \
  -H "Authorization: Bearer $TOKEN"
```

### 8. Eliminar Cuenta

```bash
curl -X DELETE $BASE_URL/api/usuarios/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## 👑 Endpoints Admin

### 9. Listar Todos los Usuarios (Solo Admin)

```bash
# Primero, hacer login con usuario admin
# Luego:
curl $BASE_URL/api/usuarios/ \
  -H "Authorization: Bearer $TOKEN_ADMIN"
```

---

## 🧪 Script de Testing Completo

```bash
#!/bin/bash

BASE_URL="http://localhost:3001"

echo "🧪 Testing Microservicio de Usuarios"
echo "===================================="

# 1. Health Check
echo -e "\n1️⃣  Health Check:"
curl -s $BASE_URL/api/usuarios/health | jq

# 2. Registro
echo -e "\n2️⃣  Registro:"
REGISTER_RESPONSE=$(curl -s -X POST $BASE_URL/api/usuarios/register \
  -H "Content-Type: application/json" \
  -d "{\"nombre\":\"Test User\",\"email\":\"test$(date +%s)@test.com\",\"password\":\"123456\"}")
echo $REGISTER_RESPONSE | jq

# 3. Login
echo -e "\n3️⃣  Login:"
EMAIL=$(echo $REGISTER_RESPONSE | jq -r '.email')
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/api/usuarios/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"123456\"}")
echo $LOGIN_RESPONSE | jq

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
echo "Token: $TOKEN"

# 4. Obtener perfil
echo -e "\n4️⃣  Obtener perfil:"
curl -s $BASE_URL/api/usuarios/me \
  -H "Authorization: Bearer $TOKEN" | jq

# 5. Añadir favorito
echo -e "\n5️⃣  Añadir favorito:"
curl -s -X POST $BASE_URL/api/usuarios/favoritos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ideess":"12345"}' | jq

# 6. Listar favoritos
echo -e "\n6️⃣  Listar favoritos:"
curl -s $BASE_URL/api/usuarios/favoritos \
  -H "Authorization: Bearer $TOKEN" | jq

echo -e "\n✅ Tests completados!"
```

Guarda este script como `test.sh` y ejecútalo con:
```bash
chmod +x test.sh
./test.sh
```

---

## 🪟 PowerShell (Windows)

```powershell
$BASE_URL = "http://localhost:3001"

# Registro
$registerBody = @{
    nombre = "Juan Test"
    email = "juan.test@example.com"
    password = "123456"
} | ConvertTo-Json

$registerResponse = Invoke-RestMethod -Uri "$BASE_URL/api/usuarios/register" `
    -Method Post `
    -Body $registerBody `
    -ContentType "application/json"

Write-Host "Usuario creado: $($registerResponse.email)"

# Login
$loginBody = @{
    email = $registerResponse.email
    password = "123456"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "$BASE_URL/api/usuarios/login" `
    -Method Post `
    -Body $loginBody `
    -ContentType "application/json"

$token = $loginResponse.token
Write-Host "Token obtenido: $($token.Substring(0,20))..."

# Obtener perfil
$headers = @{
    Authorization = "Bearer $token"
}

$perfil = Invoke-RestMethod -Uri "$BASE_URL/api/usuarios/me" `
    -Headers $headers

Write-Host "Perfil: $($perfil | ConvertTo-Json)"
```

---

## 🐛 Errores Comunes

### Error 401 - Unauthorized
```json
{
  "error": "Unauthorized"
}
```
**Solución**: Verifica que estás enviando el token JWT correcto en el header.

### Error 400 - Email ya registrado
```json
{
  "error": "El email ya está registrado."
}
```
**Solución**: Usa un email diferente.

### Error 403 - Forbidden
```json
{
  "error": "Forbidden: Admin access required"
}
```
**Solución**: Este endpoint requiere permisos de administrador.

---

## 📚 Más Información

- **Documentación Swagger**: http://localhost:3001/api-docs
- **OpenAPI Spec**: http://localhost:3001/api-docs/json
