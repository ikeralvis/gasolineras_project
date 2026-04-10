import { setCookie } from "hono/cookie";
import { fetchWithCloudRunAuth } from "./cloudRunAuthFetch.js";

function buildForwardHeaders(c) {
  const headers = {};
  for (const [key, value] of c.req.raw.headers) {
    const lowerKey = key.toLowerCase();
    if (lowerKey !== "host" && lowerKey !== "accept-encoding" && lowerKey !== "cookie") {
      headers[key] = value;
    }
  }
  return headers;
}

function ensureAuthorizationHeader(headers, token) {
  if (!headers.Authorization && !headers.authorization && token) {
    headers.Authorization = `Bearer ${token}`;
  }
}

function buildProxyUrl(c, usuariosService) {
  const path = c.req.path.replace("/api/usuarios", "/api/usuarios");
  const searchParams = new URL(c.req.url).searchParams;
  const queryString = searchParams.toString();
  const querySuffix = queryString ? `?${queryString}` : "";
  return `${usuariosService}${path}${querySuffix}`;
}

function maybeSetLoginCookie(c, data, cookieConfig) {
  if (c.req.method !== "POST" || c.req.path !== "/api/usuarios/login" || !data?.token) {
    return;
  }

  setCookie(c, "authToken", data.token, {
    httpOnly: cookieConfig.httpOnly,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    path: cookieConfig.path,
    maxAge: cookieConfig.maxAge,
  });
}

async function buildProxyResponse(c, response, cookieConfig) {
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    console.log(`↪️ Redirigiendo a: ${location}`);
    return c.redirect(location, response.status);
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    const data = await response.json();
    maybeSetLoginCookie(c, data, cookieConfig);
    return c.json(data, response.status);
  }

  const text = await response.text();
  return c.text(text, response.status);
}

export function registerUsuariosRoutes(app, {
  usuariosService,
  healthTimeoutMs,
  cookieConfig,
  getAuthTokenFromRequest,
}) {
  async function proxyUsuariosStatus(c, servicePath) {
    try {
      const response = await fetchWithCloudRunAuth(`${usuariosService}${servicePath}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(healthTimeoutMs),
      });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return c.json(await response.json(), response.status);
      }

      return c.text(await response.text(), response.status);
    } catch (error) {
      return c.json(
        {
          error: "Error al comunicarse con el servicio de usuarios",
          message: error.message,
        },
        503
      );
    }
  }

  app.get("/api/usuarios/health", (c) => proxyUsuariosStatus(c, "/health"));
  app.get("/api/usuarios/ready", (c) => proxyUsuariosStatus(c, "/ready"));
  app.get("/api/usuarios/live", (c) => proxyUsuariosStatus(c, "/live"));

  app.all("/api/usuarios/*", async (c) => {
    try {
      const url = buildProxyUrl(c, usuariosService);

      console.log(`🔄 Proxy usuarios: ${c.req.method} ${url}`);

      const headers = buildForwardHeaders(c);
      const token = getAuthTokenFromRequest(c);
      ensureAuthorizationHeader(headers, token);

      const options = {
        method: c.req.method,
        headers,
        redirect: "manual",
      };

      if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
        options.body = await c.req.text();
      }

      const response = await fetchWithCloudRunAuth(url, options);
      return buildProxyResponse(c, response, cookieConfig);
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
}
