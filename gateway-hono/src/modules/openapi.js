import { swaggerUI } from "@hono/swagger-ui";
import { fetchWithCloudRunAuth } from "./cloudRunAuthFetch.js";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);

function sanitizeGatewayPath(path) {
  if (!path || path === "/") {
    return "/";
  }
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function isHealthPath(path) {
  const cleanPath = sanitizeGatewayPath(path);
  return (
    cleanPath === "/health"
    || cleanPath.endsWith("/health")
    || cleanPath.endsWith("/ready")
    || cleanPath.endsWith("/live")
  );
}

function canonicalTagForPath(path) {
  const cleanPath = sanitizeGatewayPath(path);

  if (isHealthPath(cleanPath)) return "Health";
  if (cleanPath.startsWith("/api/auth")) return "Auth";
  if (cleanPath.startsWith("/api/usuarios")) return "Usuarios";
  if (cleanPath.startsWith("/api/gasolineras")) return "Gasolineras";
  if (cleanPath.startsWith("/api/charging")) return "EV Charging";
  if (cleanPath.startsWith("/api/recomendacion") || cleanPath.startsWith("/api/recomendaciones")) return "Recomendaciones";
  if (cleanPath.startsWith("/api/routing")) return "Routing";
  if (cleanPath.startsWith("/api/prediction")) return "Prediction";
  if (cleanPath.startsWith("/api/voice")) return "Voice";
  if (cleanPath.startsWith("/api/geocoding") || cleanPath === "/health") return "Gateway";

  return null;
}

function clonePathItem(pathItem) {
  return structuredClone(pathItem || {});
}

function normalizePathItem(path, pathItem) {
  const cleanPath = sanitizeGatewayPath(path);
  const cloned = clonePathItem(pathItem);
  const canonicalTag = canonicalTagForPath(cleanPath);

  for (const [method, operation] of Object.entries(cloned)) {
    const methodLower = method.toLowerCase();
    if (!HTTP_METHODS.has(methodLower) || !operation || typeof operation !== "object") {
      continue;
    }

    if (canonicalTag) {
      operation.tags = [canonicalTag];
      continue;
    }

    if (Array.isArray(operation.tags) && operation.tags.length > 0) {
      operation.tags = [...new Set(operation.tags.map((tag) => (tag === "Recomendación" ? "Recomendaciones" : tag)))];
    }
  }

  return cloned;
}

function buildLoadingSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "API Gateway - Gasolineras",
      version: "1.0.0",
      description: "Cargando especificaciones de microservicios...",
    },
    paths: {},
  };
}

function buildDegradedSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "API Gateway - Gasolineras",
      version: "1.0.0",
      description: "Gateway en modo degradado. No se pudieron cargar los specs de los microservicios.",
    },
    paths: {},
  };
}

function buildBaseAggregatedSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "API Gateway - Gasolineras",
      version: "1.0.0",
      description:
        "Gateway centralizado que unifica las APIs de usuarios, gasolineras, recomendaciones, EV charging y prediccion. Esta documentacion agrega automaticamente los endpoints de todos los microservicios.",
      contact: {
        name: "Equipo de desarrollo",
        email: "dev@gasolineras.com",
      },
    },
    servers: [
      {
        url: "/",
        description: "API Gateway (punto de entrada unico)",
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
                            url: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            503: {
              description: "Uno o mas servicios caidos",
            },
          },
        },
      },
      "/api/geocoding/search": {
        get: {
          summary: "Busqueda geocoding",
          description: "Proxy de busqueda de ubicaciones via Nominatim",
          tags: ["Gateway"],
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 8 } },
            { name: "countrycodes", in: "query", required: false, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Resultados de geocoding" },
            503: { description: "Servicio de geocoding no disponible" },
          },
        },
      },
      "/api/geocoding/reverse": {
        get: {
          summary: "Reverse geocoding",
          description: "Proxy de reverse geocoding via Nominatim",
          tags: ["Gateway"],
          parameters: [
            { name: "lat", in: "query", required: true, schema: { type: "number" } },
            { name: "lon", in: "query", required: true, schema: { type: "number" } },
          ],
          responses: {
            200: { description: "Resultado reverse geocoding" },
            400: { description: "Parametros invalidos" },
            503: { description: "Servicio de geocoding no disponible" },
          },
        },
      },
      "/api/auth/google/verify": {
        post: {
          summary: "Login con Google",
          description: "Verifica credencial de Google y crea sesion",
          tags: ["Auth"],
          responses: {
            200: { description: "Login correcto" },
            400: { description: "Credencial invalida o ausente" },
            401: { description: "Token de Google no valido" },
            500: { description: "Error interno" },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          summary: "Cerrar sesion",
          description: "Elimina la cookie de autenticacion",
          tags: ["Auth"],
          responses: {
            200: { description: "Logout correcto" },
          },
        },
      },
      "/api/voice/health": {
        get: {
          summary: "Health de voice-assistant",
          description: "Proxy de health del servicio de voz",
          tags: ["Health"],
          responses: {
            200: { description: "Servicio de voz operativo" },
            503: { description: "Servicio de voz no disponible" },
          },
        },
      },
      "/api/voice/capabilities": {
        get: {
          summary: "Capabilities de voice-assistant",
          description: "Devuelve informacion publica del servicio de voz",
          tags: ["Voice"],
          responses: {
            200: { description: "Capabilities del servicio de voz" },
            503: { description: "Servicio de voz no disponible" },
          },
        },
      },
      "/api/voice/dialog": {
        post: {
          summary: "Dialogo de voz",
          description: "Proxy HTTP del servicio de voz para texto o audio",
          tags: ["Voice"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    audioBase64: { type: "string" },
                    mimeType: { type: "string" },
                    includeAudio: { type: "boolean" },
                    location: {
                      type: "object",
                      properties: {
                        lat: { type: "number" },
                        lon: { type: "number" },
                        km: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Respuesta del asistente de voz" },
            400: { description: "Peticion invalida" },
            500: { description: "Error interno" },
          },
        },
      },
    },
    components: {
      securitySchemes: {},
    },
    tags: [
      { name: "Gateway", description: "Endpoints del Gateway" },
      { name: "Auth", description: "Autenticacion y gestion de usuarios (proxeado a usuarios-service)" },
      { name: "Usuarios", description: "Gestion de usuarios y perfil (proxeado a usuarios-service)" },
      { name: "Gasolineras", description: "Informacion de gasolineras (proxeado a gasolineras-service)" },
      {
        name: "Recomendaciones",
        description: "Recomendaciones de gasolineras (proxeado a recomendacion-service). Prefijo canonico: /api/recomendaciones/*",
      },
      { name: "Routing", description: "Calculo de rutas y matrices (proxeado a recomendacion-service)" },
      { name: "EV Charging", description: "Puntos de recarga electrica (integrado en gasolineras-service)" },
      {
        name: "Prediction",
        description: "Prediccion de precios (proxeado a prediction-service cuando este configurado)",
      },
      { name: "Voice", description: "Dialogo y capacidades del servicio de voz" },
      { name: "Health", description: "Health checks y monitoreo" },
    ],
  };
}

function mapUsuariosPaths(aggregatedSpec, spec) {
  if (!spec?.paths) {
    return;
  }

  for (const [path, methods] of Object.entries(spec.paths)) {
    const gatewayPath = sanitizeGatewayPath(path.startsWith("/api/usuarios") ? path : `/api/usuarios${path}`);
    aggregatedSpec.paths[gatewayPath] = normalizePathItem(gatewayPath, methods);
  }
}

function mapGasolinerasPaths(aggregatedSpec, spec) {
  if (!spec?.paths) {
    return;
  }

  for (const [path, methods] of Object.entries(spec.paths)) {
    let gatewayPath;
    if (path.startsWith("/api/charging")) {
      gatewayPath = path;
    } else if (path === "/" || path === "") {
      gatewayPath = "/api/gasolineras";
    } else if (path.startsWith("/gasolineras")) {
      gatewayPath = `/api${path}`;
    } else {
      gatewayPath = `/api/gasolineras${path}`;
    }
    const cleanGatewayPath = sanitizeGatewayPath(gatewayPath);
    aggregatedSpec.paths[cleanGatewayPath] = normalizePathItem(cleanGatewayPath, methods);
  }
}

function mapRecomendacionPaths(aggregatedSpec, spec) {
  if (!spec?.paths) {
    return;
  }

  for (const [path, methods] of Object.entries(spec.paths)) {
    if (path.startsWith("/routing")) {
      const routingPath = sanitizeGatewayPath(`/api${path}`);
      aggregatedSpec.paths[routingPath] = normalizePathItem(routingPath, methods);
      continue;
    }

    let canonicalPath;
    if (path.startsWith("/recomendacion")) {
      canonicalPath = path.replace("/recomendacion", "/api/recomendaciones");
    } else {
      canonicalPath = `/api/recomendaciones${path}`;
    }

    const cleanCanonicalPath = sanitizeGatewayPath(canonicalPath);
    aggregatedSpec.paths[cleanCanonicalPath] = normalizePathItem(cleanCanonicalPath, methods);
  }
}

function mapEvChargingPaths(aggregatedSpec, spec) {
  if (!spec?.paths) {
    return;
  }

  for (const [path, methods] of Object.entries(spec.paths)) {
    let gatewayPath;
    if (path.startsWith("/api/charging")) {
      gatewayPath = path;
    } else if (path.startsWith("/charging")) {
      gatewayPath = `/api${path}`;
    } else {
      gatewayPath = `/api/charging${path}`;
    }

    const cleanGatewayPath = sanitizeGatewayPath(gatewayPath);
    aggregatedSpec.paths[cleanGatewayPath] = normalizePathItem(cleanGatewayPath, methods);
  }
}

function mapVoicePaths(aggregatedSpec, spec) {
  if (!spec?.paths) {
    return;
  }

  // El voice service expone /health, /capabilities, /voice/dialog
  // El gateway los sirve en /api/voice/*
  for (const [path, methods] of Object.entries(spec.paths)) {
    // Saltar rutas internas
    if (path === "/openapi.json") continue;

    let gatewayPath;
    if (path.startsWith("/voice/")) {
      gatewayPath = `/api${path}`;
    } else if (path === "/health") {
      gatewayPath = "/api/voice/health";
    } else if (path === "/capabilities") {
      gatewayPath = "/api/voice/capabilities";
    } else {
      gatewayPath = `/api/voice${path}`;
    }

    const cleanGatewayPath = sanitizeGatewayPath(gatewayPath);
    aggregatedSpec.paths[cleanGatewayPath] = normalizePathItem(cleanGatewayPath, methods);
  }
}

function mapPredictionPaths(aggregatedSpec, spec) {
  if (!spec?.paths) {
    return;
  }

  for (const [path, methods] of Object.entries(spec.paths)) {
    const gatewayPath = sanitizeGatewayPath(path.startsWith("/api/prediction") ? path : `/api/prediction${path}`);
    aggregatedSpec.paths[gatewayPath] = normalizePathItem(gatewayPath, methods);
  }
}

function mergeSecuritySchemes(aggregatedSpec, specs) {
  for (const spec of Object.values(specs)) {
    if (spec?.components?.securitySchemes) {
      Object.assign(aggregatedSpec.components.securitySchemes, spec.components.securitySchemes);
    }
  }
}

export function setupOpenApiModule(app, {
  serviceRegistry,
  openapiTimeoutMs,
  openapiRetryMs,
  openapiRefreshMs,
}) {
  let aggregatedSpec = null;
  let openapiRefreshTimer = null;
  let openapiRefreshInProgress = false;

  async function fetchAndAggregateSpecs() {
    let specEntries = [];
    try {
      console.log("📚 Agregando documentacion OpenAPI de microservicios...");

      specEntries = Object.entries(serviceRegistry).filter(([, service]) => Boolean(service.url && service.openapiPath));
      const specRequests = specEntries.map(([, service]) =>
        fetchWithCloudRunAuth(`${service.url}${service.openapiPath}`, { signal: AbortSignal.timeout(openapiTimeoutMs) })
      );
      const specResponses = await Promise.allSettled(specRequests);

      const specs = {};
      const loadedServices = [];
      const missingServices = [];
      for (let i = 0; i < specEntries.length; i += 1) {
        const [serviceName] = specEntries[i];
        const response = specResponses[i];

        if (response.status === "fulfilled" && response.value.ok) {
          specs[serviceName] = await response.value.json();
          loadedServices.push(serviceName);
          console.log(`  ✅ ${serviceName} OpenAPI cargado`);
        } else {
          console.warn(`  ⚠️  ${serviceName} OpenAPI no disponible`);
          specs[serviceName] = null;
          missingServices.push(serviceName);
        }
      }

      aggregatedSpec = buildBaseAggregatedSpec();
      mapUsuariosPaths(aggregatedSpec, specs.usuarios);
      mapGasolinerasPaths(aggregatedSpec, specs.gasolineras);
      mapRecomendacionPaths(aggregatedSpec, specs.recomendacion);
      mapEvChargingPaths(aggregatedSpec, specs.ev_charging);
      mapPredictionPaths(aggregatedSpec, specs.prediction);
      mapVoicePaths(aggregatedSpec, specs.voice_assistant);
      mergeSecuritySchemes(aggregatedSpec, specs);

      console.log(`📋 Documentacion agregada: ${Object.keys(aggregatedSpec.paths).length} endpoints`);
      const missingRequiredServices = missingServices.filter((serviceName) => !serviceRegistry[serviceName]?.optional);
      return {
        loadedServices,
        missingServices,
        missingRequiredServices,
        pathCount: Object.keys(aggregatedSpec.paths).length,
      };
    } catch (error) {
      console.error("❌ Error al agregar specs:", error);
      aggregatedSpec = buildDegradedSpec();

      const missingServices = specEntries.map(([serviceName]) => serviceName);
      const missingRequiredServices = missingServices.filter((serviceName) => !serviceRegistry[serviceName]?.optional);
      return {
        loadedServices: [],
        missingServices,
        missingRequiredServices,
        pathCount: 0,
      };
    }
  }

  function scheduleOpenApiRefresh(delayMs, reason) {
    if (openapiRefreshTimer) {
      clearTimeout(openapiRefreshTimer);
    }

    const safeDelayMs = Math.max(1000, delayMs);
    console.log(`🗓️ Proxima recarga OpenAPI en ${Math.round(safeDelayMs / 1000)}s (${reason})`);

    openapiRefreshTimer = setTimeout(() => {
      refreshAggregatedSpecs(`timer:${reason}`);
    }, safeDelayMs);
  }

  async function refreshAggregatedSpecs(reason = "manual") {
    if (openapiRefreshInProgress) {
      console.log(`⏭️ Recarga OpenAPI omitida: ya hay una en curso (${reason})`);
      return;
    }

    openapiRefreshInProgress = true;
    try {
      const result = await fetchAndAggregateSpecs();
      const missingRequiredCount = result?.missingRequiredServices?.length || 0;

      if (missingRequiredCount > 0) {
        console.warn(
          `⚠️ OpenAPI incompleta (${reason}). Faltan servicios requeridos: ${result.missingRequiredServices.join(", ")}`
        );
        scheduleOpenApiRefresh(openapiRetryMs, "missing-required-services");
        return;
      }

      if ((result?.missingServices?.length || 0) > 0) {
        console.warn(`ℹ️ OpenAPI parcial (${reason}). Faltan servicios opcionales: ${result.missingServices.join(", ")}`);
      }

      scheduleOpenApiRefresh(openapiRefreshMs, "periodic-refresh");
    } finally {
      openapiRefreshInProgress = false;
    }
  }

  app.get("/openapi.json", (c) => {
    if (!aggregatedSpec) {
      return c.json(buildLoadingSpec());
    }
    return c.json(aggregatedSpec);
  });

  app.get(
    "/docs",
    swaggerUI({
      url: "/openapi.json",
    })
  );

  return {
    refreshAggregatedSpecs,
  };
}
