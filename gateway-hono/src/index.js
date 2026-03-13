import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { swaggerUI } from "@hono/swagger-ui";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

// ========================================
// 🔧 CONFIGURACIÓN
// ========================================
const PORT = process.env.PORT || 8080;
const USUARIOS_SERVICE = process.env.USUARIOS_SERVICE_URL || "http://usuarios:3001";
const GASOLINERAS_SERVICE = process.env.GASOLINERAS_SERVICE_URL || "http://gasolineras:8000";
const RECOMENDACION_SERVICE = process.env.RECOMENDACION_SERVICE_URL || "http://recomendacion:8001";
const EV_CHARGING_SERVICE = process.env.EV_CHARGING_SERVICE_URL || "http://ev-charging:8000";
const PREDICTION_SERVICE = process.env.PREDICTION_SERVICE_URL || "";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const GATEWAY_PUBLIC_URL = process.env.GATEWAY_PUBLIC_URL || "";
const FRONTEND_URLS = (process.env.FRONTEND_URLS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const SERVICE_REGISTRY = {
  usuarios: {
    url: USUARIOS_SERVICE,
    openapiPath: "/openapi.json",
    healthPath: "/health",
  },
  gasolineras: {
    url: GASOLINERAS_SERVICE,
    openapiPath: "/openapi.json",
    healthPath: "/",
  },
  recomendacion: {
    url: RECOMENDACION_SERVICE,
    openapiPath: "/openapi.json",
    healthPath: "/health",
  },
  ev_charging: {
    url: EV_CHARGING_SERVICE,
    openapiPath: "/openapi.json",
    healthPath: "/",
  },
  prediction: {
    url: PREDICTION_SERVICE,
    openapiPath: "/openapi.json",
    healthPath: "/health",
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

// ========================================
// 📡 AGREGACIÓN DE OPENAPI DE MICROSERVICIOS
// ========================================
let aggregatedSpec = null;

async function fetchAndAggregateSpecs() {
  try {
    console.log("📚 Agregando documentación OpenAPI de microservicios...");

    const specEntries = Object.entries(SERVICE_REGISTRY).filter(([, service]) => Boolean(service.url));
    const specRequests = specEntries.map(([, service]) =>
      fetch(`${service.url}${service.openapiPath}`, { signal: AbortSignal.timeout(5000) })
    );
    const specResponses = await Promise.allSettled(specRequests);

    const specs = {};
    for (let i = 0; i < specEntries.length; i += 1) {
      const [serviceName] = specEntries[i];
      const response = specResponses[i];

      if (response.status === "fulfilled" && response.value.ok) {
        specs[serviceName] = await response.value.json();
        console.log(`  ✅ ${serviceName} OpenAPI cargado`);
      } else {
        console.warn(`  ⚠️  ${serviceName} OpenAPI no disponible`);
        specs[serviceName] = null;
      }
    }

    // Crear spec agregado
    aggregatedSpec = {
      openapi: "3.1.0",
      info: {
        title: "API Gateway - Gasolineras",
        version: "1.0.0",
        description: "Gateway centralizado que unifica las APIs de usuarios, gasolineras, recomendaciones, EV charging y predicción. Esta documentación agrega automáticamente los endpoints de todos los microservicios.",
        contact: {
          name: "Equipo de desarrollo",
          email: "dev@gasolineras.com",
        },
      },
      servers: [
        {
          url: "/",
          description: "API Gateway (punto de entrada único)",
        },
      ],
      paths: {
        "/health": {
          get: {
            summary: "Health Check del Gateway",
            description: "Verifica el estado del Gateway y todos los microservicios conectados",
            tags: ["Gateway"],
            responses: {
              200: {
                description: "Todos los servicios operativos",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        status: { type: "string", enum: ["UP", "DEGRADED"] },
                        timestamp: { type: "string", format: "date-time" },
                        services: { 
                          type: "object",
                          additionalProperties: {
                            type: "object",
                            properties: {
                              status: { type: "string", enum: ["UP", "DOWN", "NOT_CONFIGURED"] },
                              url: { type: "string" }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              503: {
                description: "Uno o más servicios caídos"
              }
            }
          }
        }
      },
      components: {
        securitySchemes: {}
      },
      tags: [
        { name: "Gateway", description: "Endpoints del Gateway" },
        { name: "Auth", description: "Autenticación y gestión de usuarios (proxeado a usuarios-service)" },
        { name: "Favoritos", description: "Gestión de gasolineras favoritas (proxeado a usuarios-service)" },
        { name: "Gasolineras", description: "Información de gasolineras (proxeado a gasolineras-service)" },
        { name: "Recomendaciones", description: "Recomendaciones de gasolineras (proxeado a recomendaciones-service)" },
        { name: "EV Charging", description: "Puntos de recarga eléctrica (proxeado a ev-charging-service)" },
        { name: "Prediction", description: "Predicción de precios (proxeado a prediction-service cuando esté configurado)" },
        { name: "Health", description: "Health checks y monitoreo" }
      ]
    };

    // Agregar paths de usuarios con prefijo /api/usuarios
    if (specs.usuarios?.paths) {
      for (const [path, methods] of Object.entries(specs.usuarios.paths)) {
        // Ajustar path: si ya tiene /api/usuarios, dejarlo; si no, agregarlo
        const gatewayPath = path.startsWith("/api/usuarios") ? path : `/api/usuarios${path}`;
        aggregatedSpec.paths[gatewayPath] = methods;
      }
    }

    // Agregar paths de gasolineras con prefijo /api/gasolineras
    if (specs.gasolineras?.paths) {
      for (const [path, methods] of Object.entries(specs.gasolineras.paths)) {
        // Si el path es "/" o "/gasolineras", convertirlo a /api/gasolineras
        let gatewayPath;
        if (path === "/" || path === "") {
          gatewayPath = "/api/gasolineras";
        } else if (path.startsWith("/gasolineras")) {
          gatewayPath = `/api${path}`;
        } else {
          gatewayPath = `/api/gasolineras${path}`;
        }
        aggregatedSpec.paths[gatewayPath] = methods;
      }
    }

    if (specs.recomendacion?.paths) {
      for (const [path, methods] of Object.entries(specs.recomendacion.paths)) {
        if (path.startsWith("/recomendacion")) {
          aggregatedSpec.paths[`/api${path}`] = methods;
          aggregatedSpec.paths[path.replace("/recomendacion", "/api/recomendaciones")] = methods;
        } else {
          aggregatedSpec.paths[`/api/recomendacion${path}`] = methods;
          aggregatedSpec.paths[`/api/recomendaciones${path}`] = methods;
        }
      }
    }

    if (specs.ev_charging?.paths) {
      for (const [path, methods] of Object.entries(specs.ev_charging.paths)) {
        if (path.startsWith("/api/charging")) {
          aggregatedSpec.paths[path] = methods;
        } else if (path.startsWith("/charging")) {
          aggregatedSpec.paths[`/api${path}`] = methods;
        } else {
          aggregatedSpec.paths[`/api/charging${path}`] = methods;
        }
      }
    }

    if (specs.prediction?.paths) {
      for (const [path, methods] of Object.entries(specs.prediction.paths)) {
        const gatewayPath = path.startsWith("/api/prediction") ? path : `/api/prediction${path}`;
        aggregatedSpec.paths[gatewayPath] = methods;
      }
    }

    // Combinar securitySchemes de ambos servicios
    for (const spec of Object.values(specs)) {
      if (spec?.components?.securitySchemes) {
        Object.assign(aggregatedSpec.components.securitySchemes, spec.components.securitySchemes);
      }
    }

    console.log(`📋 Documentación agregada: ${Object.keys(aggregatedSpec.paths).length} endpoints`);
    
  } catch (error) {
    console.error("❌ Error al agregar specs:", error);
    // Fallback a spec básico
    aggregatedSpec = {
      openapi: "3.1.0",
      info: {
        title: "API Gateway - Gasolineras",
        version: "1.0.0",
        description: "Gateway en modo degradado. No se pudieron cargar los specs de los microservicios."
      },
      paths: {}
    };
  }
}

// Cargar specs al iniciar (con retry cada 10s si falla)
const tryLoadSpecs = async () => {
  await fetchAndAggregateSpecs();
  if (!aggregatedSpec || Object.keys(aggregatedSpec.paths).length <= 1) {
    console.log("🔄 Reintentando carga de specs en 10 segundos...");
    setTimeout(tryLoadSpecs, 10000);
  }
};
tryLoadSpecs();

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

// ========================================
// RUTAS DE DOCUMENTACIÓN (AGREGADA)
// ========================================
app.get("/openapi.json", (c) => {
  if (!aggregatedSpec) {
    return c.json({
      openapi: "3.1.0",
      info: {
        title: "API Gateway - Gasolineras",
        version: "1.0.0",
        description: "Cargando especificaciones de microservicios..."
      },
      paths: {}
    });
  }
  return c.json(aggregatedSpec);
});

app.get(
  "/docs",
  swaggerUI({
    url: "/openapi.json",
  })
);

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
      evCharging: "/api/charging/*",
      prediction: "/api/prediction/*",
    },
  });
});

// ========================================
// 🏥 HEALTH CHECK
// ========================================
app.get("/health", async (c) => {
  const services = {};

  for (const [serviceName, serviceConfig] of Object.entries(SERVICE_REGISTRY)) {
    if (!serviceConfig.url) {
      services[serviceName] = {
        status: serviceConfig.optional ? "NOT_CONFIGURED" : "DOWN",
        url: null,
      };
      continue;
    }

    try {
      const healthRes = await fetch(`${serviceConfig.url}${serviceConfig.healthPath}`, {
        signal: AbortSignal.timeout(3000),
      });
      services[serviceName] = {
        status: healthRes.ok ? "UP" : "DOWN",
        url: serviceConfig.url,
      };
    } catch (error) {
      services[serviceName] = {
        status: "DOWN",
        url: serviceConfig.url,
        error: error.message,
      };
    }
  }

  const requiredServices = Object.entries(SERVICE_REGISTRY).filter(([, service]) => !service.optional);
  const allRequiredServicesUp = requiredServices.every(([name]) => services[name]?.status === "UP");

  return c.json(
    {
      status: allRequiredServicesUp ? "UP" : "DEGRADED",
      timestamp: new Date().toISOString(),
      services,
    },
    allRequiredServicesUp ? 200 : 503
  );
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

// ========================================
// 🔀 PROXY: MICROSERVICIO DE USUARIOS
// ========================================
app.all("/api/usuarios/*", async (c) => {
  try {
    const path = c.req.path.replace("/api/usuarios", "/api/usuarios");
    
    // Obtener query parameters
    const searchParams = new URL(c.req.url).searchParams;
    const queryString = searchParams.toString();
    
    const url = `${USUARIOS_SERVICE}${path}${queryString ? '?' + queryString : ''}`;
    
    console.log(`🔄 Proxy usuarios: ${c.req.method} ${url}`);

    // Obtener headers y excluir host/cookie/accept-encoding (evitar fugas y problemas de compresión)
    const headers = {};
    for (const [key, value] of c.req.raw.headers) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "accept-encoding" && lowerKey !== "cookie") {
        headers[key] = value;
      }
    }

    // Si no hay Authorization pero sí cookie authToken, inyectar Bearer para usuarios-service.
    if (!headers.Authorization && !headers.authorization) {
      const token = getAuthTokenFromRequest(c);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const options = {
      method: c.req.method,
      headers,
      redirect: 'manual', // ⬅️ MUY IMPORTANTE: No seguir redirecciones automáticamente
    };

    // Si hay body, añadirlo
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      options.body = await c.req.text();
    }

    const response = await fetch(url, options);
    
    // ✅ Si es una redirección (301, 302, 303, 307, 308), pasarla al cliente
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      console.log(`↪️ Redirigiendo a: ${location}`);
      return c.redirect(location, response.status);
    }
    
    const contentType = response.headers.get("content-type");

    // Si es JSON, parsearlo y devolverlo (evita problemas de encoding)
    if (contentType?.includes("application/json")) {
      const data = await response.json();

      // Unificar sesión en cookie cuando el login devuelve token en body.
      if (c.req.method === 'POST' && c.req.path === '/api/usuarios/login' && data?.token) {
        setCookie(c, 'authToken', data.token, {
          httpOnly: COOKIE_CONFIG.httpOnly,
          secure: COOKIE_CONFIG.secure,
          sameSite: COOKIE_CONFIG.sameSite,
          path: COOKIE_CONFIG.path,
          maxAge: COOKIE_CONFIG.maxAge,
        });
      }

      return c.json(data, response.status);
    }

    // Si es texto u otro formato
    const text = await response.text();
    return c.text(text, response.status);
  } catch (error) {
    console.error("Error en proxy de usuarios:", error);
    return c.json(
      {
        error: "Error al comunicarse con el servicio de usuarios",
        message: error.message,
      },
      503
    );
  }
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
    const url = `${EV_CHARGING_SERVICE}${path}${queryString ? '?' + queryString : ''}`;

    console.log(`🔋 Proxy ev-charging: ${c.req.method} ${url}`);

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

// ========================================
// 🚀 INICIAR SERVIDOR
// ========================================
serve({ fetch: app.fetch, port: PORT });

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
║      • EV Charging:   ${EV_CHARGING_SERVICE}             ║
║      • Prediction:    ${PREDICTION_SERVICE || "(no configurado)"}      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
