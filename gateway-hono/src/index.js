import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { swaggerUI } from "@hono/swagger-ui";

// ========================================
// 🔧 CONFIGURACIÓN
// ========================================
const PORT = process.env.PORT || 8080;
const USUARIOS_SERVICE = process.env.USUARIOS_SERVICE_URL || "http://usuarios:3001";
const GASOLINERAS_SERVICE = process.env.GASOLINERAS_SERVICE_URL || "http://gasolineras:8000";
const RECOMENDACION_SERVICE = process.env.RECOMENDACION_SERVICE_URL || "http://recomendacion:8001";
const EV_CHARGING_SERVICE = process.env.EV_CHARGING_SERVICE_URL || "http://ev-charging:8000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

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
    
    // Fetch specs de cada servicio
    const [usuariosRes, gasolinerasRes] = await Promise.allSettled([
      fetch(`${USUARIOS_SERVICE}/openapi.json`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${GASOLINERAS_SERVICE}/openapi.json`, { signal: AbortSignal.timeout(5000) })
    ]);

    const specs = {
      usuarios: null,
      gasolineras: null
    };

    // Parsear spec de usuarios
    if (usuariosRes.status === "fulfilled" && usuariosRes.value.ok) {
      specs.usuarios = await usuariosRes.value.json();
      console.log("  ✅ Usuarios OpenAPI cargado");
    } else {
      console.warn("  ⚠️  Usuarios OpenAPI no disponible");
    }

    // Parsear spec de gasolineras
    if (gasolinerasRes.status === "fulfilled" && gasolinerasRes.value.ok) {
      specs.gasolineras = await gasolinerasRes.value.json();
      console.log("  ✅ Gasolineras OpenAPI cargado");
    } else {
      console.warn("  ⚠️  Gasolineras OpenAPI no disponible");
    }

    // Crear spec agregado
    aggregatedSpec = {
      openapi: "3.1.0",
      info: {
        title: "API Gateway - Gasolineras",
        version: "1.0.0",
        description: "Gateway centralizado que unifica las APIs de usuarios y gasolineras. Esta documentación agrega automáticamente los endpoints de todos los microservicios.",
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
                              status: { type: "string", enum: ["UP", "DOWN"] },
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

    // Combinar securitySchemes de ambos servicios
    if (specs.usuarios?.components?.securitySchemes) {
      Object.assign(aggregatedSpec.components.securitySchemes, specs.usuarios.components.securitySchemes);
    }
    if (specs.gasolineras?.components?.securitySchemes) {
      Object.assign(aggregatedSpec.components.securitySchemes, specs.gasolineras.components.securitySchemes);
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
      // Permitir orígenes específicos para seguridad
      const allowedOrigins = [
        FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:80",
        "http://localhost",
        "https://tankgo.onrender.com",
        // Añadir cualquier subdominio de onrender.com
      ];
      // También permitir cualquier origen *.onrender.com
      if (origin && origin.endsWith('.onrender.com')) {
        return origin;
      }
      return allowedOrigins.includes(origin) ? origin : FRONTEND_URL;
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
// � RUTAS DE DOCUMENTACIÓN (AGREGADA)
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
  return c.json({
    message: "🚀 API Gateway - Gasolineras",
    version: "1.0.0",
    documentation: `http://localhost:${PORT}/docs`,
    endpoints: {
      health: "/health",
      usuarios: "/api/usuarios/*",
      gasolineras: "/api/gasolineras",
    },
  });
});

// ========================================
// 🏥 HEALTH CHECK
// ========================================
app.get("/health", async (c) => {
  const services = {};

  // Check Usuarios Service
  try {
    const usuariosRes = await fetch(`${USUARIOS_SERVICE}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    services.usuarios = {
      status: usuariosRes.ok ? "UP" : "DOWN",
      url: USUARIOS_SERVICE,
    };
  } catch (error) {
    services.usuarios = {
      status: "DOWN",
      url: USUARIOS_SERVICE,
      error: error.message,
    };
  }

  // Check Gasolineras Service
  try {
    const gasolinerasRes = await fetch(`${GASOLINERAS_SERVICE}/`, {
      signal: AbortSignal.timeout(3000),
    });
    services.gasolineras = {
      status: gasolinerasRes.ok ? "UP" : "DOWN",
      url: GASOLINERAS_SERVICE,
    };
  } catch (error) {
    services.gasolineras = {
      status: "DOWN",
      url: GASOLINERAS_SERVICE,
      error: error.message,
    };
  }

  const allServicesUp = Object.values(services).every((s) => s.status === "UP");

  return c.json(
    {
      status: allServicesUp ? "UP" : "DEGRADED",
      timestamp: new Date().toISOString(),
      services,
    },
    allServicesUp ? 200 : 503
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
    c.header('Set-Cookie', `authToken=${token}; HttpOnly; ${COOKIE_CONFIG.secure ? 'Secure;' : ''} SameSite=${COOKIE_CONFIG.sameSite}; Path=${COOKIE_CONFIG.path}; Max-Age=${COOKIE_CONFIG.maxAge}`);
    
    // También devolver token en body para compatibilidad con frontend actual
    return c.json({ token, cookieSet: true });

  } catch (err) {
    console.error("Error verificando token de Google:", err);
    return c.json({ error: "Error del servidor" }, 500);
  }
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

    // Obtener headers y excluir host y accept-encoding (evitar problemas de compresión)
    const headers = {};
    for (const [key, value] of c.req.raw.headers) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== "host" && lowerKey !== "accept-encoding") {
        headers[key] = value;
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
app.all("/api/recomendacion/*", async (c) => {
  try {
    const path = c.req.path.replace("/api/recomendacion", "/recomendacion");
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
});

// ========================================
// 🔋 PROXY: MICROSERVICIO EV CHARGING
// ========================================
app.all("/api/charging/*", async (c) => {
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
});

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

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Gateway API - Gasolineras                           ║
║                                                           ║
║   📍 URL:          http://localhost:${PORT}                   ║
║   📄 Docs:         http://localhost:${PORT}/docs              ║
║   📋 OpenAPI:      http://localhost:${PORT}/openapi.json      ║
║   🏥 Health:       http://localhost:${PORT}/health            ║
║                                                           ║
║   🔗 Servicios:                                           ║
║      • Usuarios:     ${USUARIOS_SERVICE}                 ║
║      • Gasolineras:  ${GASOLINERAS_SERVICE}              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
