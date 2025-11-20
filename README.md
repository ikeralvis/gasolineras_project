# 🚗 TankGo - Microservicios y Frontend

<div align="center">

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)
![React](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react)
![Node.js](https://img.shields.io/badge/Node.js-20.0.0-339933?logo=node.js)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)

<img src="./frontend-client/public/logo.png" alt="Logo del Proyecto" width="200"/>

</div>

**Plataforma modular para consultar, gestionar y visualizar información de gasolineras en España.**

---

## 📋 Requisitos Previos

### Software Necesario

1. **Docker** y **Docker Compose**: Para orquestar los servicios.
   - [Instalar Docker](https://docs.docker.com/get-docker/)
   - [Instalar Docker Compose](https://docs.docker.com/compose/install/)

---

## 🏗️ Servicios Incluidos

| Servicio              | Lenguaje   | Puerto | Descripción                              |
|-----------------------|------------|--------|------------------------------------------|
| **Frontend**          | React      | 80     | Interfaz web para usuarios finales.      |
| **API Gateway**       | Node.js    | 8080   | Punto de entrada único para microservicios. |
| **Usuarios Service**  | Node.js    | 3001   | Gestión de usuarios y favoritos.         |
| **Gasolineras Service** | Python    | 8000   | Consulta y sincronización de gasolineras. |
| **MongoDB**           | Base de datos | 27017 | Base de datos no relacional para gasolineras. |
| **PostgreSQL**        | Base de datos | 5432  | Base de datos relacional para usuarios.  |

---

## 🚀 Pasos para Ejecutar el Proyecto

### 1️⃣ Clonar el Repositorio

```bash
git clone https://github.com/ikeralvis/gasolineras_project.git
cd gasolineras_project
```

### 2️⃣ Configurar Variables de Entorno

Copia los archivos `.env.example` de cada servicio y configúralos:

```bash
cp .env.example .env
```

Edita los archivos `.env` con las configuraciones necesarias (puertos, credenciales, etc.).

### 3️⃣ Levantar los Servicios con Docker Compose

```bash
docker-compose up -d --build
```

Esto iniciará todos los servicios definidos en el archivo `docker-compose.yml`.

### 4️⃣ Verificar que los Servicios Están Corriendo

```bash
docker-compose ps
```

---

## 🛠️ Dependencias

No es necesario instalar manualmente las dependencias de cada servicio (`npm install`, `pip install`, etc.). El archivo `docker-compose.yml` y los `Dockerfile` de cada servicio se encargan de instalar todas las dependencias necesarias durante el proceso de construcción de las imágenes. Simplemente asegúrate de seguir los pasos indicados en la sección "🚀 Pasos para Ejecutar el Proyecto" para levantar los servicios con Docker Compose.

---

## 🚪 Acceso a los Servicios

### 1️⃣ Frontend

- URL: [http://localhost:80](http://localhost:80)
- Interfaz web para consultar gasolineras, gestionar favoritos y más.

### 2️⃣ API Gateway

- Documentación Swagger UI: [http://localhost:8080/docs](http://localhost:8080/docs)
- Health Check: [http://localhost:8080/health](http://localhost:8080/health)

### 3️⃣ Usuarios Service

- URL Base: [http://localhost:3001](http://localhost:3001)
- Endpoints principales:
  - `POST /api/usuarios/register`: Registro de usuarios.
  - `POST /api/usuarios/login`: Inicio de sesión.

### 4️⃣ Gasolineras Service

- URL Base: [http://localhost:8000](http://localhost:8000)
- Endpoints principales:
  - `GET /gasolineras`: Listado de gasolineras.
  - `POST /gasolineras/sync`: Sincronización de datos.

---

## 🌟 Funcionalidades Clave

1. **Autenticación de Usuarios**: Registro, login y gestión de favoritos.
2. **Consulta de Gasolineras**: Filtros avanzados, historial de precios y visualización en mapa.
3. **API Gateway**: Punto de entrada único con documentación centralizada.
4. **Frontend Moderno**: SPA con React y diseño responsivo.
5. **Sincronización Automática**: Datos actualizados desde la API oficial del Gobierno de España.

---

## 📝 Notas Adicionales

- Asegúrate de que Docker y Docker Compose estén correctamente instalados.
- Los servicios de MongoDB y PostgreSQL se inicializan automáticamente con los datos necesarios.
- Consulta los README específicos de cada servicio para más detalles.

---

Desarrollado con ❤️ para el proyecto TankGo
