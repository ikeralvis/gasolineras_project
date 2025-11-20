# TankGo - Frontend

Aplicación web React para consultar gasolineras en España con funcionalidades avanzadas como autenticación, visualización de mapas y gestión de favoritos.

## 🚀 Características

- **Autenticación completa**: Login, registro, perfil de usuario.
- **Mapa interactivo**: Visualización de gasolineras en un mapa dinámico.
- **Tablas avanzadas**: Listado de gasolineras con filtros y paginación.
- **Gestión de favoritos**: Los usuarios pueden guardar y gestionar sus gasolineras favoritas.
- **Historial de precios**: Consulta de la evolución de precios de combustible.
- **Interfaz moderna**: Diseño responsivo con Tailwind CSS.

---

## 🔐 Sistema de Autenticación

La aplicación utiliza un sistema de autenticación basado en JWT para proteger las rutas y gestionar el acceso de los usuarios. 

### Funcionalidades

- **Registro de usuarios**: Permite a los usuarios crear una cuenta.
- **Inicio de sesión**: Los usuarios pueden autenticarse y obtener un token JWT.
- **Rutas protegidas**: Acceso restringido a ciertas páginas solo para usuarios autenticados.
- **Gestión de sesión**: Persistencia de sesión utilizando `localStorage`.
- **Logout automático**: Redirección al login cuando el token expira.

### Flujo de Autenticación

1. **Registro**: El usuario crea una cuenta y es redirigido al login.
2. **Login**: El usuario inicia sesión y el token JWT se guarda en `localStorage`.
3. **Navegación**: Las rutas protegidas verifican si el usuario está autenticado.
4. **Perfil**: El usuario puede ver y editar su información personal.
5. **Logout**: El token se elimina y el usuario es redirigido al login.

---

## 🌍 Funcionalidades del Frontend

### 🗺️ Mapa Interactivo
- Visualiza las gasolineras en un mapa dinámico.
- Filtra gasolineras por ubicación y tipo de combustible.
- Haz clic en una gasolinera para ver detalles como precios y dirección.

### 📋 Tablas Avanzadas
- Consulta un listado de gasolineras con filtros por provincia, municipio y precio.
- Paginación para manejar grandes volúmenes de datos.
- Ordena las columnas para encontrar rápidamente la información que necesitas.

### ⭐ Gestión de Favoritos
- Guarda tus gasolineras favoritas para acceder a ellas rápidamente.
- Añade o elimina favoritos desde la tabla o el mapa.
- Visualiza tus favoritos en una sección dedicada.

### 📈 Historial de Precios
- Consulta la evolución de precios de combustible en gasolineras específicas.
- Visualiza gráficos con datos históricos.

---

## 📖 Documentación Interactiva

Para probar los endpoints del backend, consulta la documentación interactiva generada por Swagger UI en el servidor backend. Asegúrate de que el backend esté corriendo en `http://localhost:8080`.

- **Swagger UI**: [http://localhost:8080/api-docs](http://localhost:8080/api-docs)

---

## 🚀 Próximos Pasos

- [ ] Integración con notificaciones en tiempo real.
- [ ] Implementación de un panel de administración.
- [ ] Mejora de la accesibilidad (WCAG).
- [ ] Optimización para dispositivos móviles.

---

Desarrollado con ❤️ para el proyecto TankGo.
