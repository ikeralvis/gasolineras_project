# Gasolineras España - Frontend

Aplicación web React para consultar gasolineras en España con sistema de autenticación completo.

## 🚀 Características

- **Autenticación completa**: Login, registro, perfil de usuario
- **TypeScript**: Tipado fuerte para mejor desarrollo
- **React Router**: Navegación SPA con rutas protegidas
- **Tailwind CSS**: Estilos modernos y responsivos
- **Axios**: Cliente HTTP para comunicación con APIs
- **JWT Authentication**: Autenticación basada en tokens

## 🛠️ Tecnologías

- **React 18** con TypeScript
- **Vite** para desarrollo y build
- **React Router v6** para routing
- **Tailwind CSS** para estilos
- **Axios** para HTTP requests
- **ESLint** para linting

## 📁 Estructura del Proyecto

```
src/
├── components/
│   ├── Auth/
│   │   ├── Login.tsx          # Componente de login
│   │   ├── Register.tsx       # Componente de registro
│   │   └── Profile.tsx        # Componente de perfil
│   └── ProtectedRoutes.tsx    # Rutas protegidas
├── contexts/
│   └── AuthContext.tsx        # Contexto de autenticación
├── services/
│   └── auth.ts                # Servicios de API de autenticación
├── types/
│   └── auth.ts                # Tipos TypeScript para auth
├── App.tsx                    # Componente principal con routing
└── main.tsx                   # Punto de entrada
```

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js 18+
- npm o yarn

### Instalación

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env
   ```
   Edita `.env` con la URL de tu API backend.

3. **Iniciar servidor de desarrollo:**
   ```bash
   npm run dev
   ```

4. **Verificar tipos (opcional):**
   ```bash
   npm run type-check
   ```

5. **Linting (opcional):**
   ```bash
   npm run lint
   ```

## 🔐 Sistema de Autenticación

### Endpoints del Backend

La aplicación se conecta con los siguientes endpoints del backend:

- `POST /api/usuarios/register` - Registro de usuarios
- `POST /api/usuarios/login` - Inicio de sesión
- `GET /api/usuarios/me` - Obtener perfil del usuario
- `PATCH /api/usuarios/me` - Actualizar perfil
- `DELETE /api/usuarios/me` - Eliminar cuenta

### Funcionalidades

- ✅ **Registro de usuarios** con validación
- ✅ **Inicio de sesión** con JWT
- ✅ **Perfil de usuario** (ver/editar)
- ✅ **Rutas protegidas** con redirección automática
- ✅ **Logout automático** en tokens expirados
- ✅ **Persistencia de sesión** en localStorage

### Flujo de Autenticación

1. **Registro**: Usuario crea cuenta → Redirección a login
2. **Login**: Usuario inicia sesión → Token JWT guardado
3. **Navegación**: Rutas protegidas verifican autenticación
4. **Perfil**: Usuario puede ver/editar su información
5. **Logout**: Limpieza de token y redirección

## 🎨 Estilos

El proyecto utiliza **Tailwind CSS** con un diseño moderno:

- Formularios con estados de foco y error
- Botones con estados de loading
- Layout responsivo
- Tema de colores consistente (azul/gris)

## 🔧 Desarrollo

### Scripts Disponibles

```bash
npm run dev          # Servidor de desarrollo
npm run build        # Build de producción
npm run preview      # Vista previa del build
npm run lint         # Ejecutar ESLint
npm run type-check   # Verificar tipos TypeScript
```

### Arquitectura

- **Context API**: Estado global de autenticación
- **Custom Hooks**: `useAuth()` para acceder al contexto
- **Interceptors**: Axios intercepta requests/responses para JWT
- **Protected Routes**: Componente HOC para rutas autenticadas

## 🚀 Próximos Pasos

- [ ] Integración con mapa de gasolineras (Leaflet)
- [ ] Búsqueda y filtrado de gasolineras
- [ ] Favoritos de gasolineras
- [ ] Panel de administración
- [ ] PWA con service workers

## 📝 Notas de Desarrollo

- El backend debe estar ejecutándose en `http://localhost:8080`
- Los tokens JWT se almacenan en localStorage
- Las rutas protegidas redirigen automáticamente al login
- Los errores de red se manejan con interceptors de Axios

---

Desarrollado con ❤️ para el proyecto Gasolineras España
