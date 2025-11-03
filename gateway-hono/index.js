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

// ========================================
// 🚀 APLICACIÓN HONO
// ========================================
const app = new Hono();

// ========================================
// 🛡️ MIDDLEWARES GLOBALES
// ========================================
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*", // En producción, especifica los dominios permitidos
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// ========================================
// 📄 DOCUMENTACIÓN OPENAPI
// ========================================
const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "API Gateway - Gasolineras",
    version: "1.0.0",
    description: "Gateway centralizado que redirecciona peticiones a los microservicios de usuarios y gasolineras",
    contact: {
      name: "Equipo de desarrollo",
      email: "dev@gasolineras.com",
    },
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: "Servidor local",
    },
  ],
  paths: {
    "/health": {
      get: {
        summary: "Health Check",
        description: "Verifica el estado del Gateway y de los microservicios",
        responses: {
          200: {
            description: "Gateway funcionando correctamente",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    timestamp: { type: "string" },
                    services: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/usuarios/register": {
      post: {
        summary: "Registrar usuario",
        tags: ["Usuarios"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "nombre"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 6 },
                  nombre: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Usuario creado exitosamente" },
          400: { description: "Datos inválidos" },
          409: { description: "Usuario ya existe" },
        },
      },
    },
    "/api/usuarios/login": {
      post: {
        summary: "Iniciar sesión",
        tags: ["Usuarios"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Login exitoso, devuelve token JWT" },
          401: { description: "Credenciales inválidas" },
        },
      },
    },
    "/api/usuarios/favorites": {
      get: {
        summary: "Obtener favoritos del usuario",
        tags: ["Favoritos"],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: "Lista de favoritos" },
          401: { description: "No autenticado" },
        },
      },
      post: {
        summary: "Agregar gasolinera a favoritos",
        tags: ["Favoritos"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["gasolineraId"],
                properties: {
                  gasolineraId: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Favorito agregado" },
          401: { description: "No autenticado" },
        },
      },
    },
    "/api/usuarios/favorites/{id}": {
      delete: {
        summary: "Eliminar favorito",
        tags: ["Favoritos"],
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Favorito eliminado" },
          401: { description: "No autenticado" },
          404: { description: "Favorito no encontrado" },
        },
      },
    },
    "/api/gasolineras": {
      get: {
        summary: "Obtener todas las gasolineras",
        tags: ["Gasolineras"],
        responses: {
          200: {
            description: "Lista de gasolineras",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
};

// ========================================
// 📚 RUTAS DE DOCUMENTACIÓN
// ========================================
app.get("/openapi.json", (c) => c.json(openApiSpec));

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
    const usuariosRes = await fetch(`${USUARIOS_SERVICE}/api/usuarios/health`, {
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
// 🔀 PROXY: MICROSERVICIO DE USUARIOS
// ========================================
app.all("/api/usuarios/*", async (c) => {
  try {
    const path = c.req.path.replace("/api/usuarios", "/api/usuarios");
    const url = `${USUARIOS_SERVICE}${path}`;

    // Obtener headers y excluir host
    const headers = {};
    for (const [key, value] of c.req.raw.headers) {
      if (key.toLowerCase() !== "host") {
        headers[key] = value;
      }
    }

    const options = {
      method: c.req.method,
      headers,
    };

    // Si hay body, añadirlo
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      options.body = await c.req.text();
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");

    // Copiar headers de la respuesta
    const responseHeaders = {};
    for (const [key, value] of response.headers) {
      responseHeaders[key] = value;
    }

    // Si es JSON, parsearlo
    if (contentType?.includes("application/json")) {
      const data = await response.json();
      return c.json(data, response.status, responseHeaders);
    }

    // Si es texto u otro formato
    const text = await response.text();
    return c.text(text, response.status, responseHeaders);
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
    const path = c.req.path.replace("/api/gasolineras", "");
    const url = `${GASOLINERAS_SERVICE}${path}`;

    const headers = {};
    for (const [key, value] of c.req.raw.headers) {
      if (key.toLowerCase() !== "host") {
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

    const responseHeaders = {};
    for (const [key, value] of response.headers) {
      responseHeaders[key] = value;
    }

    if (contentType?.includes("application/json")) {
      const data = await response.json();
      return c.json(data, response.status, responseHeaders);
    }

    const text = await response.text();
    return c.text(text, response.status, responseHeaders);
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
    const response = await fetch(`${GASOLINERAS_SERVICE}/gasolineras`);
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
