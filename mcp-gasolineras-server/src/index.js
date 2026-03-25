import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GATEWAY_BASE_URL = (process.env.GATEWAY_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 10000);

async function fetchJson(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(`${GATEWAY_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).slice(0, 280)}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

const server = new McpServer({
  name: "mcp-gasolineras-server",
  version: "0.1.0",
});

server.registerTool(
  "get_snapshot_status",
  {
    title: "Snapshot status",
    description: "Estado de frescura del snapshot de gasolineras",
    inputSchema: {},
  },
  async () => {
    const data = await fetchJson("/api/gasolineras/snapshot");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  }
);

server.registerTool(
  "ensure_fresh_snapshot",
  {
    title: "Ensure fresh snapshot",
    description: "Sincroniza gasolineras solo si los datos no están vigentes",
    inputSchema: {
      force: z.boolean().optional().describe("Reservado para futuras políticas de forzado"),
    },
  },
  async () => {
    const data = await fetchJson("/api/gasolineras/ensure-fresh", {
      method: "POST",
      headers: {
        "X-Internal-Secret": INTERNAL_API_SECRET,
      },
      body: JSON.stringify({}),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  }
);

server.registerTool(
  "find_nearest_station",
  {
    title: "Find nearest station",
    description: "Busca gasolineras cercanas a una coordenada",
    inputSchema: {
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      km: z.number().positive().max(200).default(8),
      limit: z.number().int().positive().max(50).default(10),
    },
  },
  async ({ lat, lon, km = 8, limit = 10 }) => {
    const data = await fetchJson(`/api/gasolineras/cerca?lat=${lat}&lon=${lon}&km=${km}&limit=${limit}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  }
);

server.registerTool(
  "find_cheapest_nearby",
  {
    title: "Find cheapest nearby",
    description: "Obtiene la estación más barata en un radio y combustible objetivo",
    inputSchema: {
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      km: z.number().positive().max(200).default(10),
      fuel: z.enum(["gasolina95", "gasolina98", "gasoleoA", "gasoleoB", "gasoleoPremium"]).default("gasolina95"),
    },
  },
  async ({ lat, lon, km = 10, fuel = "gasolina95" }) => {
    const data = await fetchJson(`/api/gasolineras/cerca?lat=${lat}&lon=${lon}&km=${km}&limit=100`);
    const list = Array.isArray(data.gasolineras) ? data.gasolineras : [];

    const fuelFieldMap = {
      gasolina95: "Precio Gasolina 95 E5",
      gasolina98: "Precio Gasolina 98 E5",
      gasoleoA: "Precio Gasoleo A",
      gasoleoB: "Precio Gasoleo B",
      gasoleoPremium: "Precio Gasoleo Premium",
    };

    const fuelField = fuelFieldMap[fuel];
    const ranked = list
      .map((station) => {
        const raw = String(station?.[fuelField] || "").replace(",", ".");
        const value = Number.parseFloat(raw);
        return {
          station,
          price: Number.isFinite(value) && value > 0 ? value : null,
        };
      })
      .filter((item) => item.price !== null)
      .sort((a, b) => a.price - b.price);

    const best = ranked.length > 0 ? ranked[0] : null;
    const result = {
      fuel,
      fuelField,
      candidates: ranked.length,
      best: best
        ? {
            price: best.price,
            station: best.station,
          }
        : null,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }
);

server.registerTool(
  "discover_infra",
  {
    title: "Discover infrastructure",
    description: "Consulta estado del gateway y microservicios conectados",
    inputSchema: {},
  },
  async () => {
    const health = await fetchJson("/health");
    return {
      content: [{ type: "text", text: JSON.stringify(health, null, 2) }],
      structuredContent: health,
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
