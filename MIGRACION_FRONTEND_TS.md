# 🚀 Migración Frontend a TypeScript + Backend Integration

## ✅ Ya Completado

1. ✅ **package.json** actualizado con:
   - TypeScript
   - Axios (cliente HTTP)
   - React Router DOM v6
   - Leaflet (mapas)
   - React 18.3.1 (versión estable)

2. ✅ **tsconfig.json** creado con configuración strict

3. ✅ **vite.config.ts** con proxy al gateway

4. ✅ **src/types/index.ts** - Tipos TypeScript globales

5. ✅ **src/services/api.ts** - Cliente API con Axios

6. ✅ **src/context/AuthContext.tsx** - Context de autenticación

7. ✅ **src/vite-env.d.ts** - Tipos para variables de entorno

## 📋 Tareas Pendientes

### Paso 1: Instalar Dependencias

```bash
cd frontend-client
npm install
```

**Importante**: Si PowerShell da error de ejecución de scripts:
- Opción A: Usa CMD o Git Bash
- Opción B: Ejecuta como admin: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

### Paso 2: Archivos TypeScript a Crear

#### 🔐 **Páginas de Autenticación**

- [ ] `src/pages/LoginPage.tsx` - Formulario de login
- [ ] `src/pages/RegisterPage.tsx` - Formulario de registro
- [ ] `src/pages/ProfilePage.tsx` - Perfil del usuario

#### 🏠 **Páginas Principales**

- [ ] `src/pages/HomePage.tsx` - Página principal con gasolineras
- [ ] `src/pages/GasStationDetailPage.tsx` - Detalle de gasolinera
- [ ] `src/pages/FavoritesPage.tsx` - Mis favoritos

#### 🧩 **Componentes Actualizados**

- [ ] `src/components/Header.tsx` - Con menú de usuario
- [ ] `src/components/GasStationCard.tsx` - Card de gasolinera
- [ ] `src/components/GasStationMap.tsx` - Mapa con Leaflet
- [ ] `src/components/FilterControls.tsx` - Filtros
- [ ] `src/components/ProtectedRoute.tsx` - Rutas protegidas
- [ ] `src/components/Navbar.tsx` - Barra de navegación

#### 🪝 **Hooks Custom** 

- [ ] `src/hooks/useGasolineras.ts` - Fetch gasolineras del backend
- [ ] `src/hooks/useFavoritos.ts` - Gestión de favoritos
- [ ] `src/hooks/useGeolocation.ts` - Geolocalización (ya existe, migrar)
- [ ] `src/hooks/useDebounce.ts` - Debounce (ya existe, migrar)

#### 📱 **App Principal**

- [ ] `src/App.tsx` - App con React Router y Context
- [ ] `src/main.tsx` - Entry point

#### 🎨 **Estilos** (Opcional migrar)

- [ ] Mantener CSS actual o migrar a Tailwind puro

### Paso 3: Configuración de Variables de Entorno

Crear `.env` en `frontend-client/`:

```env
VITE_API_BASE_URL=http://localhost:8080
```

### Paso 4: Actualizar Docker

```dockerfile
# frontend-client/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## 🎯 Arquitectura Propuesta

```
frontend-client/
├── src/
│   ├── assets/              # Imágenes, iconos
│   ├── components/          # Componentes reutilizables
│   │   ├── Header.tsx
│   │   ├── Navbar.tsx
│   │   ├── GasStationCard.tsx
│   │   ├── GasStationMap.tsx
│   │   ├── FilterControls.tsx
│   │   └── ProtectedRoute.tsx
│   ├── context/             # Contexts de React
│   │   └── AuthContext.tsx  ✅
│   ├── hooks/               # Custom hooks
│   │   ├── useGasolineras.ts
│   │   ├── useFavoritos.ts
│   │   ├── useGeolocation.ts
│   │   └── useDebounce.ts
│   ├── pages/               # Páginas/vistas
│   │   ├── HomePage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── ProfilePage.tsx
│   │   ├── GasStationDetailPage.tsx
│   │   └── FavoritesPage.tsx
│   ├── services/            # API clients
│   │   └── api.ts           ✅
│   ├── types/               # TypeScript types
│   │   └── index.ts         ✅
│   ├── utils/               # Utilidades
│   │   ├── distance.ts
│   │   ├── priceFormatter.ts
│   │   └── validators.ts
│   ├── App.tsx              # Router principal
│   ├── main.tsx             # Entry point
│   ├── index.css            # Estilos globales
│   └── vite-env.d.ts        ✅
├── public/                  # Archivos estáticos
├── .env                     # Variables entorno
├── .env.example
├── Dockerfile               # Para producción
├── nginx.conf               # Configuración Nginx
├── package.json             ✅
├── tsconfig.json            ✅
└── vite.config.ts           ✅
```

## 🔑 Features Clave

### Autenticación JWT
- ✅ Login/Registro
- ✅ Token en localStorage
- ✅ Interceptor Axios para agregar token
- ✅ Redirección automática en 401
- ✅ Context global de usuario

### Favoritos
- ✅ Guardar en backend (PostgreSQL)
- ✅ Sincronización con usuario
- ⭐ No más localStorage para favoritos

### Gasolineras
- ✅ Fetch desde backend (MongoDB)
- ✅ Filtros: provincia, municipio, precio
- ✅ Paginación (skip/limit)
- ✅ Búsqueda por texto

### Mapa
- 🗺️ Leaflet/React-Leaflet
- 📍 Geolocalización del usuario
- 📏 Cálculo de distancias

## 📡 Integración con Backend

### URLs del Gateway (Producción Docker)
```typescript
const API_BASE_URL = 'http://gateway:8080'
```

### URLs del Gateway (Desarrollo local)
```typescript
const API_BASE_URL = 'http://localhost:8080'
```

### Endpoints Disponibles

#### Auth
- `POST /api/usuarios/register` - Registro
- `POST /api/usuarios/login` - Login
- `GET /api/usuarios/me` - Perfil
- `PATCH /api/usuarios/me` - Actualizar perfil
- `DELETE /api/usuarios/me` - Eliminar cuenta

#### Favoritos
- `GET /api/usuarios/favoritos` - Listar favoritos
- `POST /api/usuarios/favoritos` - Añadir favorito
- `DELETE /api/usuarios/favoritos/:ideess` - Eliminar favorito

#### Gasolineras
- `GET /api/gasolineras?provincia=X&municipio=Y&precio_max=Z&skip=0&limit=100`
- `POST /api/gasolineras/sync` - Sincronizar (admin)
- `GET /api/gasolineras/count` - Contar

## 🎨 UI/UX

### Diseño
- ✅ Tailwind CSS
- ✅ Responsive (mobile-first)
- ✅ Dark mode (opcional)
- ✅ Animaciones suaves

### Componentes Principales
1. **Navbar**: Logo, búsqueda, usuario
2. **Filtros**: Combustible, distancia, provincia
3. **Cards**: Info gasolinera, precio, distancia
4. **Mapa**: Leaflet con marcadores
5. **Modal**: Login/Registro

## 🚀 Próximos Pasos

1. **Instalar dependencias**: `npm install` en `frontend-client/`
2. **Crear páginas**: LoginPage, RegisterPage, HomePage
3. **Crear hooks**: useGasolineras, useFavoritos
4. **Actualizar componentes**: Header, GasStationCard
5. **Crear App.tsx**: Con React Router
6. **Probar integración**: Con backend en Docker
7. **Deploy**: Dockerfile + Nginx

## 📝 Notas Importantes

- **React 18.3.1**: Versión estable (no 19.x que dio problemas)
- **Axios**: Mejor que fetch para interceptores
- **Context API**: No necesitamos Redux para este proyecto
- **TypeScript strict**: Mejor detección de errores
- **Leaflet**: Más ligero que Google Maps

## 🐛 Troubleshooting

### Error: Cannot find module 'axios'
```bash
npm install
```

### Error: PowerShell execution policy
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
O usa CMD/Git Bash

### Error: CORS
- ✅ Ya configurado en backend (ALLOWED_ORIGINS)
- ✅ Proxy en vite.config.ts

### Error: 401 Unauthorized
- Verificar token en localStorage
- Verificar JWT_SECRET en backend
- Ver logs del gateway

---

**Estado**: ⏳ Esperando `npm install` para continuar con los componentes TypeScript
