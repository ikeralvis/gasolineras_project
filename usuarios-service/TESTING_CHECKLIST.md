# ✅ CHECKLIST DE TESTING - Microservicio Usuarios

## 📋 Preparación

- [ ] Variables de entorno configuradas en `.env`
- [ ] JWT_SECRET generado (mínimo 32 caracteres)
- [ ] Docker y Docker Compose instalados
- [ ] Puerto 3001 disponible

## 🚀 Inicialización

```bash
# 1. Generar JWT_SECRET
.\generate-jwt-secret.ps1

# 2. Configurar .env
cp .env.example .env
# Editar .env con el JWT_SECRET generado

# 3. Construir e iniciar servicios
docker-compose up --build usuarios postgres

# 4. Verificar que inició correctamente
docker logs usuarios-service
```

## 🧪 Tests de Funcionalidad

### 1. Healthcheck Endpoints

```bash
# Test: /health
curl http://localhost:3001/health
# Esperado: 200 OK con status: "ok" y database: "connected"

# Test: /ready
curl http://localhost:3001/ready
# Esperado: 200 OK con ready: true

# Test: /live
curl http://localhost:3001/live
# Esperado: 200 OK con alive: true
```

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

### 2. Registro de Usuario

#### Test 2.1: Registro exitoso con contraseña fuerte
```bash
curl -X POST http://localhost:3001/api/usuarios/register \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Ana García",
    "email": "ana@example.com",
    "password": "MiPassword123!"
  }'
```
**Esperado**: 201 Created con `id`, `nombre`, `email`

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 2.2: Registro fallido - contraseña débil (sin números)
```bash
curl -X POST http://localhost:3001/api/usuarios/register \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Pérez",
    "email": "juan@example.com",
    "password": "Password!"
  }'
```
**Esperado**: 400 Bad Request con error: "La contraseña debe contener al menos un número."

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 2.3: Registro fallido - contraseña sin mayúsculas
```bash
curl -X POST http://localhost:3001/api/usuarios/register \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "María López",
    "email": "maria@example.com",
    "password": "password123!"
  }'
```
**Esperado**: 400 Bad Request con error sobre mayúsculas/minúsculas

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 2.4: Registro fallido - email duplicado
```bash
# Intentar registrar el mismo email de Test 2.1
curl -X POST http://localhost:3001/api/usuarios/register \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Ana Duplicada",
    "email": "ana@example.com",
    "password": "OtraPassword123!"
  }'
```
**Esperado**: 400 Bad Request con error: "El email ya está registrado."

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

### 3. Login

#### Test 3.1: Login exitoso
```bash
curl -X POST http://localhost:3001/api/usuarios/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ana@example.com",
    "password": "MiPassword123!"
  }'
```
**Esperado**: 200 OK con `token` JWT

**Guardar el token para tests siguientes:**
```bash
export TOKEN="<pegar_token_aquí>"
```

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 3.2: Login fallido - credenciales incorrectas
```bash
curl -X POST http://localhost:3001/api/usuarios/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ana@example.com",
    "password": "PasswordIncorrecto123!"
  }'
```
**Esperado**: 401 Unauthorized con error: "Credenciales inválidas."

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

### 4. Rate Limiting

#### Test 4.1: Rate limit en login (5 intentos en 15 min)
```bash
# Ejecutar 6 veces seguidas
for i in {1..6}; do
  echo "Intento $i:"
  curl -X POST http://localhost:3001/api/usuarios/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"any"}'
  echo -e "\n---"
done
```
**Esperado**: Los primeros 5 devuelven 401, el 6º devuelve 429 (Too Many Requests)

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

### 5. Perfil de Usuario (Autenticado)

#### Test 5.1: Ver perfil con JWT válido
```bash
curl -X GET http://localhost:3001/api/usuarios/me \
  -H "Authorization: Bearer $TOKEN"
```
**Esperado**: 200 OK con `id`, `nombre`, `email`, `is_admin`

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 5.2: Ver perfil sin JWT
```bash
curl -X GET http://localhost:3001/api/usuarios/me
```
**Esperado**: 401 Unauthorized

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 5.3: Ver perfil con JWT inválido
```bash
curl -X GET http://localhost:3001/api/usuarios/me \
  -H "Authorization: Bearer token_invalido_12345"
```
**Esperado**: 401 Unauthorized con error: "Token inválido"

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

### 6. Actualizar Perfil

#### Test 6.1: Actualizar nombre
```bash
curl -X PATCH http://localhost:3001/api/usuarios/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Ana García Actualizada"
  }'
```
**Esperado**: 200 OK con datos actualizados

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 6.2: Actualizar password con contraseña débil
```bash
curl -X PATCH http://localhost:3001/api/usuarios/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "12345"
  }'
```
**Esperado**: 400 Bad Request con error de validación

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

### 7. Favoritos

#### Test 7.1: Añadir favorito
```bash
curl -X POST http://localhost:3001/api/usuarios/favoritos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ideess": "12345"
  }'
```
**Esperado**: 201 Created

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 7.2: Listar favoritos
```bash
curl -X GET http://localhost:3001/api/usuarios/favoritos \
  -H "Authorization: Bearer $TOKEN"
```
**Esperado**: 200 OK con array conteniendo el favorito añadido

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 7.3: Eliminar favorito
```bash
curl -X DELETE http://localhost:3001/api/usuarios/favoritos/12345 \
  -H "Authorization: Bearer $TOKEN"
```
**Esperado**: 200 OK con mensaje de éxito

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 7.4: Intentar eliminar favorito sin JWT
```bash
curl -X DELETE http://localhost:3001/api/usuarios/favoritos/12345
```
**Esperado**: 401 Unauthorized

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

### 8. Swagger/OpenAPI

#### Test 8.1: Acceder a documentación Swagger
```
Abrir en navegador: http://localhost:3001/api-docs
```
**Esperado**: Interfaz de Swagger UI cargada correctamente con todos los endpoints

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 8.2: Verificar agrupación por tags
**Esperado**: Endpoints agrupados en:
- Auth
- Favoritos
- Health

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

### 9. CORS

#### Test 9.1: Request desde origen permitido
```bash
curl -X OPTIONS http://localhost:3001/api/usuarios/login \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -v
```
**Esperado**: Headers CORS presentes y permitiendo el origen

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

### 10. Docker

#### Test 10.1: Healthcheck del contenedor
```bash
docker inspect usuarios-service --format='{{json .State.Health}}'
```
**Esperado**: Status "healthy"

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 10.2: Logs del contenedor
```bash
docker logs usuarios-service --tail 20
```
**Esperado**: Sin errores, conexión a DB establecida

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

#### Test 10.3: Usuario no-root
```bash
docker exec usuarios-service whoami
```
**Esperado**: Output "appuser" (NO "root")

**Resultado**: [ ] ✅ Pasado | [ ] ❌ Fallado

---

## 📊 Resumen de Resultados

| Categoría | Tests Pasados | Tests Totales | % |
|-----------|---------------|---------------|---|
| Healthcheck | ___ / 3 | 3 | ___% |
| Registro | ___ / 4 | 4 | ___% |
| Login | ___ / 2 | 2 | ___% |
| Rate Limiting | ___ / 1 | 1 | ___% |
| Perfil | ___ / 3 | 3 | ___% |
| Actualización | ___ / 2 | 2 | ___% |
| Favoritos | ___ / 4 | 4 | ___% |
| Swagger | ___ / 2 | 2 | ___% |
| CORS | ___ / 1 | 1 | ___% |
| Docker | ___ / 3 | 3 | ___% |
| **TOTAL** | **___ / 25** | **25** | **___%** |

---

## 🐛 Problemas Encontrados

Documentar aquí cualquier problema o comportamiento inesperado:

1. 
2. 
3. 

---

## ✅ Aprobación Final

- [ ] Todos los tests críticos pasados (>90%)
- [ ] Sin errores en logs
- [ ] Healthchecks funcionando
- [ ] Rate limiting efectivo
- [ ] Validaciones funcionando correctamente
- [ ] Docker optimizado y seguro
- [ ] Documentación Swagger completa

**Fecha de testing**: _______________

**Probado por**: _______________

**Estado**: [ ] ✅ APROBADO | [ ] ⚠️ APROBADO CON OBSERVACIONES | [ ] ❌ RECHAZADO

---

## 🔧 Comandos Útiles

```bash
# Ver logs en tiempo real
docker logs -f usuarios-service

# Reiniciar solo el servicio de usuarios
docker-compose restart usuarios

# Reconstruir desde cero
docker-compose down
docker-compose up --build usuarios

# Conectar a la base de datos
docker exec -it postgres psql -U postgres -d usuarios_db

# Ver usuarios en la DB
docker exec -it postgres psql -U postgres -d usuarios_db -c "SELECT id, nombre, email, is_admin FROM users;"

# Limpiar todo
docker-compose down -v
```
