# 🚀 Análisis de Mejoras y Seguridad - TankGo

**Fecha:** 29 de Noviembre de 2025  
**Versión:** 1.0.0  
**Estado actual:** Producción en Render

---

## 📊 Índice

1. [Estado Actual del Proyecto](#1-estado-actual-del-proyecto)
2. [Análisis de Seguridad](#2-análisis-de-seguridad)
3. [Optimización de MongoDB Atlas](#3-optimización-de-mongodb-atlas)
4. [Nuevas Features Propuestas](#4-nuevas-features-propuestas)
5. [Mejoras PWA](#5-mejoras-pwa)
6. [Mejoras de UX/UI](#6-mejoras-de-uxui)
7. [Plan de Implementación](#7-plan-de-implementación)

---

## 1. Estado Actual del Proyecto

### 🏗️ Arquitectura

```
┌─────────────────────┐     ┌──────────────────────┐
│   Frontend (React)  │────▶│   Gateway (Hono.js)  │
│   tankgo.onrender   │     │  gateway-gzzi.render │
└─────────────────────┘     └──────────┬───────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
          ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐
          │ usuarios-service│ │gasolineras-svc  │ │ MongoDB Atlas │
          │   (Fastify)     │ │   (FastAPI)     │ │   (512MB)     │
          └────────┬────────┘ └────────┬────────┘ └───────────────┘
                   ▼                   │
          ┌─────────────────┐          │
          │   PostgreSQL    │◀─────────┘
          │    (Render)     │
          └─────────────────┘
```

### 📦 Tecnologías Actuales

| Componente | Tecnología | Estado |
|------------|------------|--------|
| Frontend | React 18 + Vite + TypeScript | ✅ |
| UI | Tailwind CSS | ✅ |
| Mapas | Leaflet | ✅ |
| Gateway | Hono.js | ✅ |
| Auth Service | Fastify + PostgreSQL | ✅ |
| Gasolineras Service | FastAPI + MongoDB | ✅ |
| OAuth | Google Sign-In (@react-oauth/google) | ✅ |
| PWA | Vite PWA Plugin | ✅ Básico |
| Documentación | Swagger/OpenAPI | ✅ |

### 📈 Uso de MongoDB Atlas (CRÍTICO)

**Límite:** 512 MB  
**Uso actual:** ~100 MB (20%)

**Colecciones:**
- `gasolineras`: ~12,000 documentos (~50 MB)
- `precios_historicos`: ~12,000 docs/día (~50 MB/día) ⚠️

**⚠️ PROBLEMA:** Si sincronizamos diariamente, en ~8 días llenaremos MongoDB Atlas.

---

## 2. Análisis de Seguridad

### 🔐 Autenticación - Estado Actual

#### ✅ Puntos Fuertes

1. **JWT bien implementado**
   - Secret validado al iniciar (>32 chars requerido)
   - Expiración configurable (7d por defecto)
   - Payload mínimo (id, email, is_admin, nombre)

2. **Passwords seguros**
   - bcrypt con 10 salt rounds
   - Validación de contraseña fuerte implementada
   - No se almacena password en texto plano

3. **Rate Limiting**
   - Login: 5 intentos / 15 min
   - Register: 5 intentos / 15 min
   - Protección contra fuerza bruta

4. **Google OAuth seguro**
   - Verificación de token con Google API
   - Validación de audience (client_id)
   - Flujo popup (no redirect vulnerable)

5. **Headers de seguridad**
   - Helmet activado
   - CORS configurado correctamente
   - COOP para popups de OAuth

#### ⚠️ Vulnerabilidades y Mejoras Necesarias

| Vulnerabilidad | Riesgo | Solución Propuesta | Prioridad |
|----------------|--------|-------------------|-----------|
| JWT en localStorage | Medio | Migrar a httpOnly cookies | Alta |
| No hay refresh token | Bajo | Implementar refresh token flow | Media |
| Sin validación de origen en /google/internal | Alto | Añadir secret compartido gateway↔usuarios | **Crítica** |
| Sin logs de auditoría | Medio | Implementar tabla audit_logs | Media |
| Sin 2FA | Bajo | Añadir TOTP para cuentas sensibles | Baja |
| Sin CSRF protection | Medio | Añadir CSRF token para forms | Media |

### 🔒 Recomendaciones de Seguridad Inmediatas

#### 1. Proteger endpoint interno de Google OAuth

```javascript
// gateway-hono/src/index.js
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

// Al llamar a usuarios-service
const internalResponse = await fetch(`${USUARIOS_SERVICE}/api/usuarios/google/internal`, {
  method: "POST",
  headers: { 
    "Content-Type": "application/json",
    "X-Internal-Secret": INTERNAL_SECRET  // ← AÑADIR
  },
  body: JSON.stringify({...})
});
```

```javascript
// usuarios-service/src/routes/auth.js
fastify.post('/google/internal', {
  onRequest: async (request, reply) => {
    const secret = request.headers['x-internal-secret'];
    if (secret !== process.env.INTERNAL_API_SECRET) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  }
}, async (request, reply) => {...});
```

#### 2. Migrar JWT a httpOnly Cookies

```javascript
// En login response
reply
  .setCookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 // 7 días
  })
  .send({ success: true });
```

#### 3. Añadir logs de auditoría

```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
```

---

## 3. Optimización de MongoDB Atlas

### 📊 Análisis del Problema

**Situación actual:**
- 512 MB límite gratuito
- ~100 MB usado (gasolineras + 1 día histórico)
- Cada sync diario añade ~50 MB de histórico
- **En 8 días se llenaría**

### 🎯 Estrategias de Optimización

#### Opción A: Solo histórico de favoritos (RECOMENDADA)

**Concepto:** Solo guardar histórico de gasolineras que algún usuario tiene como favorita.

```python
# gasolineras-service/app/routes/gasolineras.py

@router.post("/sync")
def sync_gasolineras():
    # ... sincronizar gasolineras actuales (se sobrescriben, no crecen) ...
    
    # Solo guardar histórico de favoritas
    favoritas_ids = obtener_ids_favoritas()  # Llamar a usuarios-service
    
    documentos_historicos = []
    for g in datos_normalizados:
        if g.get("IDEESS") in favoritas_ids:
            doc_historico = {
                "IDEESS": g.get("IDEESS"),
                "fecha": fecha_hoy,
                "precios": {...}
            }
            documentos_historicos.append(doc_historico)
    
    # Esto reduce de ~12,000 a ~100-500 registros/día
```

**Ahorro estimado:** 95-99% del espacio de histórico

#### Opción B: Histórico limitado a 30 días

```python
# Limpiar registros antiguos en cada sync
from datetime import timedelta

fecha_limite = datetime.now(timezone.utc) - timedelta(days=30)
historico_collection.delete_many({"fecha": {"$lt": fecha_limite}})
```

**Ahorro estimado:** Límite fijo de ~1.5 GB máx (30 días × 50 MB)

#### Opción C: Histórico solo de gasolineras cercanas a usuarios activos

```python
# Guardar histórico solo para ubicaciones con usuarios activos
# Requiere endpoint en usuarios-service que devuelva ubicaciones de usuarios
ubicaciones_usuarios = obtener_ubicaciones_usuarios_activos()

for ubicacion in ubicaciones_usuarios:
    gasolineras_cerca = obtener_gasolineras_cerca(ubicacion, radio_km=20)
    # Solo guardar histórico de estas
```

#### Opción D: Compresión de datos históricos (Recomendada combinada)

```python
# En lugar de guardar documento completo, guardar solo diff
doc_historico = {
    "IDEESS": g.get("IDEESS"),
    "fecha": fecha_hoy,
    "p95": precio_95,  # Solo números, no strings
    "p98": precio_98,
    "pA": precio_gasoleo_a
}
# Reduce de ~500 bytes/doc a ~100 bytes/doc
```

### 📋 Plan de Acción MongoDB

| Fase | Acción | Ahorro Estimado |
|------|--------|-----------------|
| 1 | Comprimir formato histórico | 80% |
| 2 | Limitar a 30 días | Fijo 30 días |
| 3 | Solo favoritas con histórico | 95% |
| 4 | TTL Index automático | Automático |

```python
# TTL Index para auto-eliminar documentos viejos
historico_collection.create_index(
    "fecha", 
    expireAfterSeconds=30*24*60*60  # 30 días
)
```

---

## 4. Nuevas Features Propuestas

### 🌟 Features de Alto Valor

#### 4.1 Alertas de Precio (Push Notifications)

**Descripción:** Notificar al usuario cuando una gasolinera favorita baje de cierto precio.

**Implementación:**
```typescript
// Frontend - Registrar para push
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: VAPID_PUBLIC_KEY
});

// Backend - Nuevo endpoint
POST /api/usuarios/alertas
{
  "ideess": "12345",
  "combustible": "Precio Gasolina 95 E5",
  "precio_objetivo": 1.45
}
```

**Tablas necesarias:**
```sql
CREATE TABLE price_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  ideess VARCHAR(50) NOT NULL,
  combustible VARCHAR(50) NOT NULL,
  precio_objetivo DECIMAL(5,3) NOT NULL,
  activa BOOLEAN DEFAULT TRUE,
  push_subscription JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Valor:** ⭐⭐⭐⭐⭐ (Diferenciador clave)

---

#### 4.2 Comparador de Rutas

**Descripción:** Calcular la ruta más económica considerando precio + distancia.

**Implementación:**
```typescript
// Frontend - Nuevo componente
<RutaOptima 
  origen={ubicacionActual}
  destino={destinoSeleccionado}
  combustible="Precio Gasolina 95 E5"
/>

// Algoritmo
const calcularRutaOptima = (origen, destino, gasolineras) => {
  // Considerar:
  // - Precio del combustible
  // - Distancia de desvío
  // - Consumo estimado del vehículo
  return gasolinerasOrdenadas;
};
```

**Valor:** ⭐⭐⭐⭐

---

#### 4.3 Histórico de Precios con Gráficas

**Descripción:** Visualizar evolución de precios con charts interactivos.

**Implementación:**
```typescript
// Usando Recharts o Chart.js
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

<LineChart data={historialPrecios}>
  <Line type="monotone" dataKey="gasolina95" stroke="#3b82f6" />
  <Line type="monotone" dataKey="gasoleoA" stroke="#ef4444" />
</LineChart>
```

**Valor:** ⭐⭐⭐⭐

---

#### 4.4 Widget para Pantalla de Inicio (Android)

**Descripción:** Widget nativo que muestra precio de gasolinera favorita.

**Implementación:** Requiere TWA (Trusted Web Activity) o app nativa wrapper.

**Valor:** ⭐⭐⭐

---

#### 4.5 Modo Offline Mejorado

**Descripción:** Cachear datos de favoritas para consulta sin conexión.

**Implementación:**
```javascript
// sw.js - Estrategia Cache First para favoritas
workbox.routing.registerRoute(
  ({url}) => url.pathname.includes('/api/gasolineras/'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'gasolineras-cache',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 24 * 60 * 60 // 24 horas
      })
    ]
  })
);
```

**Valor:** ⭐⭐⭐⭐

---

#### 4.6 Compartir Gasolinera

**Descripción:** Compartir ubicación/precio de gasolinera por WhatsApp, etc.

**Implementación:**
```typescript
const compartirGasolinera = async (gasolinera) => {
  if (navigator.share) {
    await navigator.share({
      title: `${gasolinera.Rotulo} - TankGo`,
      text: `Gasolina 95: ${gasolinera['Precio Gasolina 95 E5']}€`,
      url: `https://tankgo.onrender.com/gasolinera/${gasolinera.IDEESS}`
    });
  }
};
```

**Valor:** ⭐⭐⭐

---

#### 4.7 Reseñas y Valoraciones

**Descripción:** Permitir a usuarios valorar gasolineras (limpieza, servicio, etc.)

**Tablas:**
```sql
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  ideess VARCHAR(50) NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comentario TEXT,
  limpieza INTEGER CHECK (limpieza >= 1 AND limpieza <= 5),
  servicio INTEGER CHECK (servicio >= 1 AND servicio <= 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, ideess)
);
```

**Valor:** ⭐⭐⭐⭐

---

#### 4.8 Predicción de Precios (ML)

**Descripción:** Usar histórico para predecir tendencia de precios.

**Implementación:**
```python
# Modelo simple de tendencia
from sklearn.linear_model import LinearRegression

def predecir_precio(ideess, dias_futuro=7):
    historico = get_historico(ideess, dias=30)
    X = np.array(range(len(historico))).reshape(-1, 1)
    y = np.array([h['precio'] for h in historico])
    
    model = LinearRegression().fit(X, y)
    prediccion = model.predict([[len(historico) + dias_futuro]])
    
    return {
        "tendencia": "subida" if model.coef_[0] > 0 else "bajada",
        "prediccion_7d": round(prediccion[0], 3)
    }
```

**Valor:** ⭐⭐⭐⭐⭐ (Innovador)

---

### 📊 Matriz de Priorización

| Feature | Impacto | Esfuerzo | Prioridad |
|---------|---------|----------|-----------|
| Alertas de precio | Alto | Medio | 🔴 Alta |
| Histórico con gráficas | Alto | Bajo | 🔴 Alta |
| Modo offline mejorado | Medio | Bajo | 🔴 Alta |
| Compartir gasolinera | Medio | Bajo | 🟡 Media |
| Comparador de rutas | Alto | Alto | 🟡 Media |
| Reseñas | Medio | Medio | 🟡 Media |
| Predicción ML | Alto | Alto | 🟢 Baja |
| Widget Android | Medio | Alto | 🟢 Baja |

---

## 5. Mejoras PWA

### 📱 Estado Actual PWA

| Característica | Estado | Mejora |
|----------------|--------|--------|
| Manifest | ✅ Básico | Añadir shortcuts |
| Service Worker | ✅ Workbox | Mejorar cache strategies |
| Iconos | ✅ 192x192, 512x512 | Añadir maskable icons |
| Instalable | ✅ | Mejorar prompt |
| Offline | ⚠️ Básico | Cache de favoritas |
| Push Notifications | ❌ | Implementar |

### 🔧 Mejoras Propuestas

#### 5.1 App Shortcuts (Accesos directos)

```json
// manifest.webmanifest
{
  "shortcuts": [
    {
      "name": "Buscar Gasolineras",
      "short_name": "Buscar",
      "description": "Encuentra gasolineras cercanas",
      "url": "/gasolineras?utm_source=homescreen",
      "icons": [{ "src": "/icons/search-96.png", "sizes": "96x96" }]
    },
    {
      "name": "Mis Favoritas",
      "short_name": "Favoritas",
      "url": "/favoritos",
      "icons": [{ "src": "/icons/star-96.png", "sizes": "96x96" }]
    },
    {
      "name": "Mapa",
      "short_name": "Mapa",
      "url": "/mapa",
      "icons": [{ "src": "/icons/map-96.png", "sizes": "96x96" }]
    }
  ]
}
```

#### 5.2 Push Notifications

```javascript
// Registrar suscripción
async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });
  
  // Enviar al backend
  await fetch('/api/usuarios/push-subscription', {
    method: 'POST',
    body: JSON.stringify(subscription),
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
}
```

#### 5.3 Background Sync

```javascript
// Sincronizar favoritos cuando vuelva la conexión
self.addEventListener('sync', event => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

async function syncFavorites() {
  const pendingFavorites = await getFromIndexedDB('pending-favorites');
  for (const fav of pendingFavorites) {
    await fetch('/api/usuarios/favoritos', {
      method: 'POST',
      body: JSON.stringify({ ideess: fav.ideess })
    });
  }
}
```

---

## 6. Mejoras de UX/UI

### 🎨 Mejoras Visuales

1. **Skeleton Loading**
   - Añadir placeholders animados mientras cargan datos
   
2. **Animaciones de transición**
   - Framer Motion para transiciones suaves entre páginas

3. **Tema oscuro**
   - Implementar dark mode con Tailwind

4. **Mejoras de accesibilidad**
   - Añadir `aria-labels` faltantes
   - Mejorar contraste de colores
   - Navegación por teclado completa

### 📊 Mejoras de Datos

1. **Caché local con SWR/React Query**
   ```typescript
   import useSWR from 'swr';
   
   const { data, error, isLoading } = useSWR(
     '/api/gasolineras/cerca?lat=40&lon=-3',
     fetcher,
     { revalidateOnFocus: false }
   );
   ```

2. **Optimistic Updates**
   - Actualizar UI antes de confirmar con servidor

---

## 7. Plan de Implementación

### 🗓️ Roadmap Propuesto

#### Fase 1: Seguridad y Estabilidad (1-2 semanas)
- [x] Proteger endpoint /google/internal ✅ IMPLEMENTADO
- [ ] Implementar logs de auditoría
- [x] Optimizar MongoDB (TTL index, compresión) ✅ IMPLEMENTADO
- [x] Migrar JWT a httpOnly cookies ✅ IMPLEMENTADO

#### Fase 2: PWA Avanzada (1 semana)
- [ ] App shortcuts
- [ ] Maskable icons
- [ ] Mejoras de cache offline
- [ ] Install prompt personalizado

#### Fase 3: Features Core (2-3 semanas)
- [ ] Histórico de precios con gráficas
- [ ] Compartir gasolinera
- [ ] Modo offline mejorado

#### Fase 4: Features Avanzadas (3-4 semanas)
- [ ] Alertas de precio (push notifications)
- [ ] Reseñas y valoraciones
- [ ] Comparador de rutas

#### Fase 5: Innovación (Futuro)
- [ ] Predicción de precios con ML
- [ ] Widget Android (TWA)

---

## 📝 Conclusiones

### Prioridades Inmediatas

1. **🔴 CRÍTICO:** Proteger endpoint `/google/internal` con secret compartido
2. **🔴 CRÍTICO:** Implementar TTL en MongoDB para evitar llenar Atlas
3. **🟡 IMPORTANTE:** Migrar JWT a cookies httpOnly
4. **🟡 IMPORTANTE:** Implementar histórico con gráficas (valor visual alto)

### Diferenciadores Clave

- **Alertas de precio:** Ninguna app española tiene esto bien implementado
- **Predicción de precios:** Innovador y útil para planificar repostajes
- **PWA completa:** Experiencia nativa sin necesidad de app store

### Métricas de Éxito

| Métrica | Actual | Objetivo 3 meses |
|---------|--------|-----------------|
| Usuarios registrados | 0 | 100 |
| PWA instalada | 0% | 30% |
| Retención 7 días | - | 40% |
| Lighthouse PWA | 80 | 95 |
| MongoDB uso | 100MB | <300MB |

---

*Documento generado para TankGo - Gasolineras PWA*
