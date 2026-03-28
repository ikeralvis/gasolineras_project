import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { setupOpenApiModule } from "./modules/openapi.js";
import { registerHealthRoute } from "./modules/health.js";
import { registerUsuariosRoutes } from "./modules/proxyUsuarios.js";

// ========================================
// 🔧 CONFIGURACIÓN
// ========================================
const PORT = process.env.PORT || 8080;
const USUARIOS_SERVICE = process.env.USUARIOS_SERVICE_URL || "http://usuarios:3001";
const GASOLINERAS_SERVICE = process.env.GASOLINERAS_SERVICE_URL || "http://gasolineras:8000";
const RECOMENDACION_SERVICE = process.env.RECOMENDACION_SERVICE_URL || "http://recomendacion:8001";
const VOICE_ASSISTANT_SERVICE = process.env.VOICE_ASSISTANT_SERVICE_URL || "http://voice-assistant:8090";
const PREDICTION_SERVICE = process.env.PREDICTION_SERVICE_URL || "";
const GEOCODING_BASE_URL = process.env.GEOCODING_BASE_URL || "https://nominatim.openstreetmap.org";
const GEOCODING_USER_AGENT = process.env.GEOCODING_USER_AGENT || "TankGo/1.0 (geocoding proxy)";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const GATEWAY_PUBLIC_URL = process.env.GATEWAY_PUBLIC_URL || "";
const FRONTEND_URLS = (process.env.FRONTEND_URLS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const OPENAPI_TIMEOUT_MS = Number(process.env.OPENAPI_TIMEOUT_MS || 12000);
const OPENAPI_RETRY_MS = Number(process.env.OPENAPI_RETRY_MS || 10000);
const OPENAPI_REFRESH_MS = Number(process.env.OPENAPI_REFRESH_MS || 300000);
const HEALTH_TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_MS || 12000);
const GASOLINERAS_AUTO_ENSURE_FRESH_ENABLED = (process.env.GASOLINERAS_AUTO_ENSURE_FRESH_ENABLED || "true").toLowerCase() === "true";
const GASOLINERAS_AUTO_ENSURE_INTERVAL_MINUTES = Number(process.env.GASOLINERAS_AUTO_ENSURE_INTERVAL_MINUTES || 60);
const GASOLINERAS_STARTUP_ENSURE_FRESH = (process.env.GASOLINERAS_STARTUP_ENSURE_FRESH || "true").toLowerCase() === "true";

const SERVICE_REGISTRY = {
  usuarios: {
    url: USUARIOS_SERVICE,
    openapiPath: "/openapi.json",
    healthPaths: ["/health", "/ready", "/live"],
  },
  gasolineras: {
    url: GASOLINERAS_SERVICE,
    openapiPath: "/openapi.json",
    healthPaths: ["/health", "/"],
  },
  recomendacion: {
    url: RECOMENDACION_SERVICE,
    openapiPath: "/openapi.json",
    healthPaths: ["/health", "/"],
  },
  voice_assistant: {
    url: VOICE_ASSISTANT_SERVICE,
    openapiPath: null,
    healthPaths: ["/health"],
    optional: true,
  },
  prediction: {
    url: PREDICTION_SERVICE,
    openapiPath: "/openapi.json",
    healthPaths: ["/health", "/"],
    optional: true,
  },
};

// Google OAuth config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// 🔐 Secret compartido para comunicación interna entre servicios
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;
if (!INTERNAL_API_SECRET) {
  console.warn("⚠️  WARNING: INTERNAL_API_SECRET no configurado. Usando valor por defecto (inseguro en producción)");
}
const INTERNAL_SECRET = INTERNAL_API_SECRET || "dev-internal-secret-change-in-production";

// Configuración de cookies
const COOKIE_CONFIG = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? "None" : "Lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 // 7 días en segundos
};

function getAuthTokenFromRequest(c) {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }
  return getCookie(c, "authToken") || null;
}

// ========================================
// 🚀 APLICACIÓN HONO
// ========================================
const app = new Hono();

const geocodingCache = new Map();

function cacheGet(key) {
  const entry = geocodingCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    geocodingCache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data, ttlMs = 5 * 60 * 1000) {
  geocodingCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

async function fetchGeocodingJson(url) {
  const cached = cacheGet(url);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": GEOCODING_USER_AGENT,
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Geocoding HTTP ${response.status}: ${detail}`);
  }

  const data = await response.json();
  cacheSet(url, data);
  return data;
}

const openApiModule = setupOpenApiModule(app, {
  serviceRegistry: SERVICE_REGISTRY,
  openapiTimeoutMs: OPENAPI_TIMEOUT_MS,
  openapiRetryMs: OPENAPI_RETRY_MS,
  openapiRefreshMs: OPENAPI_REFRESH_MS,
});

await openApiModule.refreshAggregatedSpecs("startup");

// ========================================
// 🛡️ MIDDLEWARES GLOBALES
// ========================================
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return FRONTEND_URL;
      }

      // CORS por configuración: cloud mediante FRONTEND_URL/FRONTEND_URLS,
      // y localhost extra sólo en entorno no productivo.
      const allowedOrigins = new Set([FRONTEND_URL, ...FRONTEND_URLS].filter(Boolean));
      if (!IS_PRODUCTION) {
        ["http://localhost:5173", "http://localhost:80", "http://localhost"].forEach((url) => {
          allowedOrigins.add(url);
        });
      }

      return allowedOrigins.has(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true, // ⬅️ Importante para cookies
  })
);

// Headers adicionales para permitir popups de Google OAuth
app.use("*", async (c, next) => {
  await next();
  // Permitir popups de Google Sign-In
  c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
});

app.get("/", (c) => {
  const requestUrl = new URL(c.req.url);
  const baseUrl = GATEWAY_PUBLIC_URL || requestUrl.origin;

  return c.json({
    message: "🚀 API Gateway - Gasolineras",
    version: "1.0.0",
    documentation: `${baseUrl}/docs`,
    endpoints: {
      health: "/health",
      usuarios: "/api/usuarios/*",
      gasolineras: "/api/gasolineras/*",
      recomendaciones: "/api/recomendacion/* o /api/recomendaciones/*",
      geocoding: "/api/geocoding/search y /api/geocoding/reverse",
      evCharging: "/api/charging/*",
      prediction: "/api/prediction/*",
    },
  });
});

// ========================================
// 🌍 GEOCODING PROXY: NOMINATIM
// ========================================
app.get("/api/geocoding/search", async (c) => {
  try {
    const query = (c.req.query("q") || "").trim();
    if (query.length < 2) {
      return c.json([]);
    }

    const limit = Number(c.req.query("limit") || "5");
    const countrycodes = (c.req.query("countrycodes") || "es").trim();

    const url = new URL(`${GEOCODING_BASE_URL}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 8)));
    if (countrycodes) {
      url.searchParams.set("countrycodes", countrycodes);
    }

    const data = await fetchGeocodingJson(url.toString());
    return c.json(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("Error geocoding search:", error);
    return c.json(
      {
        error: "Geocoding search failed",
        message: error.message,
      },
      503
    );
  }
});

app.get("/api/geocoding/reverse", async (c) => {
  try {
    const lat = c.req.query("lat");
    const lon = c.req.query("lon");
    if (!lat || !lon) {
      return c.json({ error: "lat and lon are required" }, 400);
    }

    const url = new URL(`${GEOCODING_BASE_URL}/reverse`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);

    const data = await fetchGeocodingJson(url.toString());
    return c.json(data || {});
  } catch (error) {
    console.error("Error geocoding reverse:", error);
    return c.json(
      {
        error: "Geocoding reverse failed",
        message: error.message,
      },
      503
    );
  }
});

registerHealthRoute(app, {
  serviceRegistry: SERVICE_REGISTRY,
  healthTimeoutMs: HEALTH_TIMEOUT_MS,
});

// ========================================
// 🔐 GOOGLE OAUTH (manejado por Gateway)
// ========================================

// POST /api/auth/google/verify - Verificar ID Token de Google (para @react-oauth/google)
// Este es el ÚNICO endpoint necesario para OAuth con el nuevo flujo
app.post("/api/auth/google/verify", async (c) => {
  try {
    const { credential } = await c.req.json();

    if (!credential) {
      return c.json({ error: "No se recibió credencial de Google" }, 400);
    }

    console.log("🔐 Verificando ID Token de Google...");

    // Verificar el ID token con Google
    const verifyResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
    );

    if (!verifyResponse.ok) {
      console.error("Token de Google inválido");
      return c.json({ error: "Token de Google inválido" }, 401);
    }

    const googleUser = await verifyResponse.json();

    // Validar que el token sea para nuestra app
    if (googleUser.aud !== GOOGLE_CLIENT_ID) {
      console.error("Token no válido para esta aplicación");
      return c.json({ error: "Token no válido para esta aplicación" }, 401);
    }

    console.log(`✅ Usuario de Google verificado: ${googleUser.email}`);

    // Llamar al usuarios-service para crear/obtener usuario y generar JWT
    // 🔐 Usando secret interno para proteger endpoint
    const internalResponse = await fetch(`${USUARIOS_SERVICE}/api/usuarios/google/internal`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET
      },
      body: JSON.stringify({
        google_id: googleUser.sub,
        email: googleUser.email,
        name: googleUser.name || googleUser.email.split("@")[0]
      })
    });

    if (!internalResponse.ok) {
      const errorData = await internalResponse.json();
      console.error("Error del usuarios-service:", errorData);
      return c.json({ error: "Error al procesar usuario" }, 500);
    }

    const { token } = await internalResponse.json();
    console.log(`✅ JWT generado para ${googleUser.email}`);

    // 🍪 Establecer token en cookie httpOnly (más seguro que localStorage)
    setCookie(c, 'authToken', token, {
      httpOnly: COOKIE_CONFIG.httpOnly,
      secure: COOKIE_CONFIG.secure,
      sameSite: COOKIE_CONFIG.sameSite,
      path: COOKIE_CONFIG.path,
      maxAge: COOKIE_CONFIG.maxAge,
    });
    
    // También devolver token en body para compatibilidad con frontend actual
    return c.json({ token, cookieSet: true });

  } catch (err) {
    console.error("Error verificando token de Google:", err);
    return c.json({ error: "Error del servidor" }, 500);
  }
});

// POST /api/auth/logout - Limpiar cookie de sesión
app.post('/api/auth/logout', (c) => {
  deleteCookie(c, 'authToken', {
    path: COOKIE_CONFIG.path,
    secure: COOKIE_CONFIG.secure,
    sameSite: COOKIE_CONFIG.sameSite,
  });
  return c.json({ ok: true });
});

registerUsuariosRoutes(app, {
  usuariosService: USUARIOS_SERVICE,
  healthTimeoutMs: HEALTH_TIMEOUT_MS,
  cookieConfig: COOKIE_CONFIG,
  getAuthTokenFromRequest,
});

// ========================================
// 🔀 PROXY: MICROSERVICIO DE GASOLINERAS
// ========================================
app.all("/api/gasolineras/*", async (c) => {
  try {
    const gasPath = c.req.path.replace('/api/gasolineras', '');

    // Proteger endpoint de sincronización para uso interno únicamente.
    if (gasPath === '/sync' && c.req.method === 'POST') {
      const incomingSecret = c.req.header('X-Internal-Secret');
      if (incomingSecret !== INTERNAL_SECRET) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }

    const path = c.req.path.replace("/api/gasolineras", "/gasolineras");
    
    // Obtener query parameters correctamente
    const searchParams = new URL(c.req.url).searchParams;
    const queryString = searchParams.toString();
    
    const url = `${GASOLINERAS_SERVICE}${path}${queryString ? '?' + queryString : ''}`;
    
    console.log(`🔄 Proxy gasolineras: ${c.req.method} ${url}`);

    // Excluir host y accept-encoding para evitar problemas de compresión
    const headers = {};
    for (const [key, value] of c.req.raw.headers) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "accept-encoding") {
        headers[key] = value;
      }
    }

    // En llamadas internas sensibles, reenviar siempre el secreto interno del gateway.
    if (gasPath === '/sync' && c.req.method === 'POST') {
      headers['X-Internal-Secret'] = INTERNAL_SECRET;
    }

    const options = {
      method: c.req.method,
      headers,
    };

    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      options.body = await c.req.text();
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      const data = await response.json();
      return c.json(data, response.status);
    }

    const text = await response.text();
    return c.text(text, response.status);
  } catch (error) {
    console.error("Error en proxy de gasolineras:", error);
    return c.json(
      {
        error: "Error al comunicarse con el servicio de gasolineras",
        message: error.message,
      },
      503
    );
  }
});

// Ruta específica para obtener todas las gasolineras
app.get("/api/gasolineras", async (c) => {
  try {
    // Obtener query parameters
    const searchParams = new URL(c.req.url).searchParams;
    const queryString = searchParams.toString();
    
    const url = `${GASOLINERAS_SERVICE}/gasolineras${queryString ? '?' + queryString : ''}`;
    console.log(`🔄 Proxy gasolineras list: GET ${url}`);
    
    const response = await fetch(url);
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error("Error al obtener gasolineras:", error);
    return c.json(
      {
        error: "Error al obtener gasolineras",
        message: error.message,
      },
      503
    );
  }
});

// ========================================
// 🗺️  PROXY: MICROSERVICIO DE RECOMENDACIÓN
// ========================================
async function proxyRecomendacion(c, publicPrefix) {
  try {
    const path = c.req.path.replace(publicPrefix, "/recomendacion");
    const searchParams = new URL(c.req.url).searchParams;
    const queryString = searchParams.toString();
    const url = `${RECOMENDACION_SERVICE}${path}${queryString ? '?' + queryString : ''}`;

    console.log(`🔄 Proxy recomendacion: ${c.req.method} ${url}`);

    const headers = {};
    for (const [key, value] of c.req.raw.headers) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "accept-encoding") {
        headers[key] = value;
      }
    }

    const options = { method: c.req.method, headers };
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      options.body = await c.req.text();
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      const data = await response.json();
      return c.json(data, response.status);
    }
    return c.text(await response.text(), response.status);
  } catch (error) {
    console.error("Error en proxy de recomendacion:", error);
    return c.json(
      { error: "Error al comunicarse con el servicio de recomendación", message: error.message },
      503
    );
  }
}

app.all("/api/recomendacion", async (c) => proxyRecomendacion(c, "/api/recomendacion"));
app.all("/api/recomendacion/*", async (c) => proxyRecomendacion(c, "/api/recomendacion"));
app.all("/api/recomendaciones", async (c) => proxyRecomendacion(c, "/api/recomendaciones"));
app.all("/api/recomendaciones/*", async (c) => proxyRecomendacion(c, "/api/recomendaciones"));

// ========================================
// 🔮 PROXY: MICROSERVICIO DE PREDICCIÓN
// ========================================
async function proxyPrediction(c) {
  if (!PREDICTION_SERVICE) {
    return c.json(
      {
        error: "Prediction service no configurado",
        message: "Define PREDICTION_SERVICE_URL para habilitar /api/prediction/*",
      },
      501
    );
  }

  try {
    const path = c.req.path.replace("/api/prediction", "");
    const searchParams = new URL(c.req.url).searchParams;
    const queryString = searchParams.toString();
    const url = `${PREDICTION_SERVICE}/api/prediction${path}${queryString ? "?" + queryString : ""}`;

    console.log(`🔮 Proxy prediction: ${c.req.method} ${url}`);

    const headers = {};
    for (const [key, value] of c.req.raw.headers) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "accept-encoding") {
        headers[key] = value;
      }
    }

    const options = { method: c.req.method, headers };
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      options.body = await c.req.text();
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      const data = await response.json();
      return c.json(data, response.status);
    }
    return c.text(await response.text(), response.status);
  } catch (error) {
    console.error("Error en proxy de prediction:", error);
    return c.json(
      { error: "Error al comunicarse con el servicio de predicción", message: error.message },
      503
    );
  }
}

app.all("/api/prediction", proxyPrediction);
app.all("/api/prediction/*", proxyPrediction);

// ========================================
// 🔋 PROXY: MICROSERVICIO EV CHARGING
// ========================================
async function proxyCharging(c) {
  try {
    const path = c.req.path.replace("/api/charging", "/api/charging");
    const searchParams = new URL(c.req.url).searchParams;
    const queryString = searchParams.toString();
    const url = `${GASOLINERAS_SERVICE}${path}${queryString ? '?' + queryString : ''}`;

    console.log(`🔋 Proxy EV integrado (gasolineras-service): ${c.req.method} ${url}`);

    const headers = {};
    for (const [key, value] of c.req.raw.headers) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "accept-encoding") {
        headers[key] = value;
      }
    }

    const options = { method: c.req.method, headers };
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      options.body = await c.req.text();
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      const data = await response.json();
      return c.json(data, response.status);
    }
    return c.text(await response.text(), response.status);
  } catch (error) {
    console.error("Error en proxy de ev-charging:", error);
    return c.json(
      { error: "Error al comunicarse con el servicio EV Charging", message: error.message },
      503
    );
  }
}

app.all("/api/charging", proxyCharging);
app.all("/api/charging/*", proxyCharging);

// ========================================
// 🗣️ PROXY: VOICE ASSISTANT SERVICE
// ========================================
async function proxyVoice(c) {
  try {
    const path = c.req.path === "/api/voice/health"
      ? "/health"
      : c.req.path.replace("/api/voice", "/voice");
    const searchParams = new URL(c.req.url).searchParams;
    const queryString = searchParams.toString();
    const querySuffix = queryString ? `?${queryString}` : "";
    const url = `${VOICE_ASSISTANT_SERVICE}${path}${querySuffix}`;

    console.log(`🗣️ Proxy voice: ${c.req.method} ${url}`);

    const headers = {};
    for (const [key, value] of c.req.raw.headers) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "accept-encoding") {
        headers[key] = value;
      }
    }

    const options = { method: c.req.method, headers };
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      options.body = await c.req.text();
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await response.json();
      return c.json(data, response.status);
    }

    return c.text(await response.text(), response.status);
  } catch (error) {
    console.error("Error en proxy de voice assistant:", error);
    return c.json(
      {
        error: "Error al comunicarse con el servicio de voz",
        message: error.message,
      },
      503
    );
  }
}

app.all("/api/voice", proxyVoice);
app.all("/api/voice/*", proxyVoice);

// ========================================
// ❌ MANEJO DE RUTAS NO ENCONTRADAS
// ========================================
app.notFound((c) => {
  return c.json(
    {
      error: "Ruta no encontrada",
      path: c.req.path,
      method: c.req.method,
      message: "La ruta solicitada no existe en el Gateway",
    },
    404
  );
});

// ========================================
// ⚠️ MANEJO DE ERRORES GLOBAL
// ========================================
app.onError((err, c) => {
  console.error("Error global:", err);
  return c.json(
    {
      error: "Error interno del servidor",
      message: err.message,
    },
    500
  );
});

async function ensureGasolinerasFresh(reason = "scheduler") {
  try {
    if (!GASOLINERAS_SERVICE) {
      return;
    }
    const response = await fetch(`${GASOLINERAS_SERVICE}/gasolineras/ensure-fresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.warn(`⚠️ ensure-fresh falló (${reason}) status=${response.status}`, payload);
      return;
    }

    if (payload.synced) {
      console.log(`✅ ensure-fresh ejecutó sincronización (${reason}):`, {
        total: payload.total,
        fecha_snapshot: payload.fecha_snapshot,
      });
    } else {
      console.log(`ℹ️ ensure-fresh no sincroniza (${reason}): snapshot vigente`);
    }
  } catch (error) {
    console.warn(`⚠️ Error ejecutando ensure-fresh (${reason}):`, error.message);
  }
}

// ========================================
// 🚀 INICIAR SERVIDOR
// ========================================
serve({ fetch: app.fetch, port: PORT });

if (GASOLINERAS_AUTO_ENSURE_FRESH_ENABLED) {
  if (GASOLINERAS_STARTUP_ENSURE_FRESH) {
    setTimeout(() => {
      ensureGasolinerasFresh("startup");
    }, 4000);
  }

  const intervalMs = Math.max(5, GASOLINERAS_AUTO_ENSURE_INTERVAL_MINUTES) * 60 * 1000;
  setInterval(() => {
    ensureGasolinerasFresh("interval");
  }, intervalMs);
}

const startupBaseUrl = GATEWAY_PUBLIC_URL || `http://localhost:${PORT}`;

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Gateway API - Gasolineras                           ║
║                                                           ║
║   📍 URL:          ${startupBaseUrl}                     ║
║   📄 Docs:         ${startupBaseUrl}/docs                ║
║   📋 OpenAPI:      ${startupBaseUrl}/openapi.json        ║
║   🏥 Health:       ${startupBaseUrl}/health              ║
║                                                          ║
║   🔗 Servicios:                                          ║
║      • Usuarios:     ${USUARIOS_SERVICE}                 ║
║      • Gasolineras:  ${GASOLINERAS_SERVICE}              ║
║      • Recomendación: ${RECOMENDACION_SERVICE}           ║
║      • EV Charging:   Integrado en Gasolineras           ║
║      • Prediction:    ${PREDICTION_SERVICE || "(no configurado)"}      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
