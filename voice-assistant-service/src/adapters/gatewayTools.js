const GATEWAY_BASE_URL = (process.env.GATEWAY_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";
const MCP_GATEWAY_MODE = String(process.env.MCP_GATEWAY_MODE || "mcp-first").toLowerCase();
const MCP_TIMEOUT_MS = Number(process.env.MCP_TIMEOUT_MS || 4000);
const MCP_SERVER_COMMAND = process.env.MCP_SERVER_COMMAND || "";
const MCP_SERVER_ARGS = String(process.env.MCP_SERVER_ARGS || "")
  .split(" ")
  .map((arg) => arg.trim())
  .filter(Boolean);

const USER_FUEL_FIELD_MAP = {
  "Precio Gasolina 95 E5": "Precio Gasolina 95 E5",
  "Precio Gasolina 98 E5": "Precio Gasolina 98 E5",
  "Precio Gasoleo A": "Precio Gasoleo A",
  "Precio Gasoleo B": "Precio Gasoleo B",
  "Precio Gasoleo Premium": "Precio Gasoleo Premium",
};

let mcpClientPromise = null;

function parsePrice(value) {
  if (value == null) return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout (${timeoutMs}ms)`)), timeoutMs);
    }),
  ]);
}

function normalizeMcpToolResult(result) {
  if (!result || typeof result !== "object") return null;
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  if (Array.isArray(result.content)) {
    const textBlock = result.content.find((c) => c?.type === "text" && typeof c?.text === "string");
    if (textBlock?.text) {
      try {
        return JSON.parse(textBlock.text);
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function getMcpClient() {
  if (mcpClientPromise) return mcpClientPromise;

  mcpClientPromise = (async () => {
    if (!MCP_SERVER_COMMAND) {
      throw new Error("MCP_SERVER_COMMAND not configured");
    }

    const [{ Client }, { StdioClientTransport }] = await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/stdio.js"),
    ]);

    const client = new Client({
      name: "voice-assistant-service",
      version: "0.1.0",
    });

    const transport = new StdioClientTransport({
      command: MCP_SERVER_COMMAND,
      args: MCP_SERVER_ARGS,
      env: {
        ...process.env,
      },
    });

    await withTimeout(client.connect(transport), MCP_TIMEOUT_MS, "mcp-connect");
    return client;
  })();

  try {
    return await mcpClientPromise;
  } catch (error) {
    mcpClientPromise = null;
    throw error;
  }
}

async function tryMcpTool(name, args) {
  if (MCP_GATEWAY_MODE === "rest") return null;

  try {
    const client = await getMcpClient();
    const result = await withTimeout(client.callTool({ name, arguments: args }), MCP_TIMEOUT_MS, `mcp-tool:${name}`);
    const normalized = normalizeMcpToolResult(result);
    if (!normalized) {
      throw new Error(`MCP tool returned empty payload: ${name}`);
    }
    return normalized;
  } catch (error) {
    if (MCP_GATEWAY_MODE === "mcp-only") {
      throw error;
    }
    return null;
  }
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${GATEWAY_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

async function getUserFuelPreferenceField(authToken) {
  if (!authToken) return null;
  const me = await fetchJson("/api/usuarios/me", {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
  const fuelField = USER_FUEL_FIELD_MAP[me?.combustible_favorito] || null;
  return fuelField;
}

async function getNearestStationFromRest({ lat, lon, km = 8, limit = 5, authToken }) {
  const data = await fetchJson(`/api/gasolineras/cerca?lat=${lat}&lon=${lon}&km=${km}&limit=${limit}`);
  const station = Array.isArray(data.gasolineras) && data.gasolineras.length > 0 ? data.gasolineras[0] : null;

  let preferredFuelField = null;
  let preferredFuelPriceRaw = null;
  let preferredFuelPrice = null;

  if (station && authToken) {
    try {
      preferredFuelField = await getUserFuelPreferenceField(authToken);
      if (preferredFuelField) {
        preferredFuelPriceRaw = station?.[preferredFuelField] ?? null;
        preferredFuelPrice = parsePrice(preferredFuelPriceRaw);
      }
    } catch {
      preferredFuelField = null;
    }
  }

  return {
    station,
    preferredFuelField,
    preferredFuelPriceRaw,
    preferredFuelPrice,
    source: "gateway-rest",
  };
}

export async function getNearestStation({ lat, lon, km = 8, limit = 5, authToken }) {
  const mcpPreferred = await tryMcpTool("find_nearest_for_user_preference", {
    lat,
    lon,
    km,
    limit,
    ...(authToken ? { authToken } : {}),
  });

  if (mcpPreferred?.nearest?.station) {
    return {
      station: mcpPreferred.nearest.station,
      preferredFuelField: mcpPreferred.fuelField || null,
      preferredFuelPriceRaw: mcpPreferred.nearest.preferredFuelPriceRaw ?? null,
      preferredFuelPrice: mcpPreferred.nearest.preferredFuelPrice ?? null,
      source: "mcp-preferred-nearest",
    };
  }

  const mcpNearest = await tryMcpTool("find_nearest_station", {
    lat,
    lon,
    km,
    limit,
  });

  if (Array.isArray(mcpNearest?.gasolineras) && mcpNearest.gasolineras.length > 0) {
    return {
      station: mcpNearest.gasolineras[0],
      preferredFuelField: null,
      preferredFuelPriceRaw: null,
      preferredFuelPrice: null,
      source: "mcp-nearest",
    };
  }

  return getNearestStationFromRest({ lat, lon, km, limit, authToken });
}

export async function ensureFreshSnapshot() {
  const mcpData = await tryMcpTool("ensure_fresh_snapshot", {});
  if (mcpData) {
    return { ...mcpData, source: "mcp" };
  }

  const data = await fetchJson("/api/gasolineras/ensure-fresh", {
    method: "POST",
    headers: {
      "X-Internal-Secret": INTERNAL_API_SECRET,
    },
    body: JSON.stringify({}),
  });
  return { ...data, source: "gateway-rest" };
}
