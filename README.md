# 🛢️ Gasolineras Project

Proyecto modular basado en microservicios para obtener, gestionar y mostrar información de gasolineras.

---

## 🚀 Estructura
```
gasolineras_project/
│
├── gateway-hono/          # API Gateway (Node.js + Hono)
├── usuarios-service/      # Microservicio de usuarios (Node.js + Fastify)
├── gasolineras-service/   # Microservicio de datos (Python + FastAPI)
├── frontend-client/       # SPA en React (HTML5)
└── docker-compose.yml     # Orquestación de servicios
```

---

## 🧰 Tecnologías

- **Node.js** (Hono + Fastify)
- **Python** (FastAPI)
- **MongoDB** y **PostgreSQL**
- **Docker** & **Docker Compose**
- **Swagger / OpenAPI**
- **React** (SPA)

---

## ⚙️ Instalación

### 1️⃣ Clonar el repositorio
```bash
git clone https://github.com/tuusuario/gasolineras_project.git
cd gasolineras_project
```

### 2️⃣ Crear los archivos `.env`

Copia los archivos `.env.example` y configura tus variables de entorno.

### 3️⃣ Levantar todo con Docker
```bash
docker compose up -d --build
```

### 4️⃣ Comprobar endpoints

| Servicio      | Puerto | URL                              |
|---------------|--------|----------------------------------|
| Gateway       | 8080   | http://localhost:8080/health     |
| Usuarios      | 3001   | http://localhost:3001/health     |
| Gasolineras   | 3002   | http://localhost:3002/health     |

---

## 🧪 Tests

Pendiente de implementación en los microservicios.

---

## 🧱 Despliegue futuro

Se podrá desplegar fácilmente en:

- **Render.com**
- **Railway.app**
- **Fly.io**
- **Docker Hub + VPS**

---

## ✅ Resultado final

- El `.gitignore` mantiene limpio tu repo
- Los `.env` nunca se suben
- Cualquier persona puede clonar y levantar el proyecto con solo 2 comandos
- Tu README documenta el proceso de forma profesional

---

## 📝 Notas adicionales

¿Necesitas los archivos `.env.example` para cada servicio (Gateway, Usuarios y Gasolineras) con valores por defecto y explicación comentada? Esto facilitará la configuración inicial del proyecto.