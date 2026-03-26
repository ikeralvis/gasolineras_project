import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GATEWAY_BASE_URL = (process.env.GATEWAY_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 10000);
const DEFAULT_USER_BEARER_TOKEN = process.env.DEFAULT_USER_BEARER_TOKEN || "";

const FUEL_FIELD_MAP = {
  gasolina95: "Precio Gasolina 95 E5",
  gasolina98: "Precio Gasolina 98 E5",
  gasoleoA: "Precio Gasoleo A",
  gasoleoB: "Precio Gasoleo B",
  gasoleoPremium: "Precio Gasoleo Premium",
};

const USER_FUEL_TO_ENUM = {
  "Precio Gasolina 95 E5": "gasolina95",
  "Precio Gasolina 98 E5": "gasolina98",
  "Precio Gasoleo A": "gasoleoA",
  "Precio Gasoleo B": "gasoleoB",
  "Precio Gasoleo Premium": "gasoleoPremium",
};

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

function buildGatewayPath(pathname, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const q = params.toString();
  return q ? `${pathname}?${q}` : pathname;
}

function parsePrice(value) {
  if (value == null) return null;
  const raw = String(value).replace(",", ".");
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function buildUserAuthHeader(authToken) {
  const token = (authToken || DEFAULT_USER_BEARER_TOKEN || "").trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function getUserProfileOrNull(authToken) {
  const headers = buildUserAuthHeader(authToken);
  if (!headers.Authorization) return null;
  try {
    return await fetchJson("/api/usuarios/me", { headers });
  } catch {
    return null;
  }
}

async function getUserFavoritesOrEmpty(authToken) {
  const headers = buildUserAuthHeader(authToken);
  if (!headers.Authorization) return [];
  try {
    const data = await fetchJson("/api/usuarios/favoritos", { headers });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function resolveFuelFieldFromUser(userProfile, fallbackFuel = "gasolina95") {
  const preferredFuelField = userProfile?.combustible_favorito || null;
  const mappedFuelEnum = preferredFuelField ? USER_FUEL_TO_ENUM[preferredFuelField] : null;
  const fuel = mappedFuelEnum || fallbackFuel;
  return {
    fuel,
    fuelField: FUEL_FIELD_MAP[fuel],
    fromUserPreference: Boolean(mappedFuelEnum),
  };
}

function rankByPriceAndDistance(items, fuelField, favoriteIds = new Set()) {
  const enriched = items
    .map((station) => {
      const price = parsePrice(station?.[fuelField]);
      const distanceKm = Number(station?.distancia_km);
      const hasDistance = Number.isFinite(distanceKm) && distanceKm >= 0;
      if (price === null || !hasDistance) return null;
      return {
        station,
        price,
        distanceKm,
        isFavorite: favoriteIds.has(String(station?.IDEESS || "")),
      };
    })
    .filter(Boolean);

  if (enriched.length === 0) return [];

  const minPrice = Math.min(...enriched.map((x) => x.price));
  const maxPrice = Math.max(...enriched.map((x) => x.price));
  const minDist = Math.min(...enriched.map((x) => x.distanceKm));
  const maxDist = Math.max(...enriched.map((x) => x.distanceKm));

  const normalize = (v, min, max) => {
    if (max === min) return 0;
    return (v - min) / (max - min);
  };

  return enriched
    .map((item) => {
      const priceScore = normalize(item.price, minPrice, maxPrice);
      const distanceScore = normalize(item.distanceKm, minDist, maxDist);
      const favoriteBonus = item.isFavorite ? 0.05 : 0;
      const score = 0.7 * priceScore + 0.3 * distanceScore - favoriteBonus;
      return {
        ...item,
        score: Number(score.toFixed(6)),
      };
    })
    .sort((a, b) => a.score - b.score);
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
    const data = await fetchJson(buildGatewayPath("/api/gasolineras/cerca", { lat, lon, km, limit: 100 }));
    const list = Array.isArray(data.gasolineras) ? data.gasolineras : [];

    const fuelField = FUEL_FIELD_MAP[fuel];
    const ranked = list
      .map((station) => {
        const value = parsePrice(station?.[fuelField]);
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
  "list_gasolineras_filtered",
  {
    title: "List gasolineras filtered",
    description: "Lista gasolineras con filtros por provincia, municipio y precio máximo",
    inputSchema: {
      provincia: z.string().optional(),
      municipio: z.string().optional(),
      precioMax: z.number().positive().optional(),
      skip: z.number().int().min(0).default(0),
      limit: z.number().int().positive().max(500).default(50),
    },
  },
  async ({ provincia, municipio, precioMax, skip = 0, limit = 50 }) => {
    const path = buildGatewayPath("/api/gasolineras", {
      provincia,
      municipio,
      precio_max: precioMax,
      skip,
      limit,
    });
    const data = await fetchJson(path);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  }
);

server.registerTool(
  "get_user_profile_preferences",
  {
    title: "Get user profile preferences",
    description: "Obtiene preferencias del usuario autenticado (incluye combustible favorito)",
    inputSchema: {
      authToken: z.string().optional().describe("JWT Bearer del usuario. Si no se envía, usa DEFAULT_USER_BEARER_TOKEN"),
    },
  },
  async ({ authToken }) => {
    const data = await fetchJson("/api/usuarios/me", {
      headers: buildUserAuthHeader(authToken),
    });
    const normalized = {
      ...data,
      fuel_preference_enum: data?.combustible_favorito ? USER_FUEL_TO_ENUM[data.combustible_favorito] || null : null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(normalized, null, 2) }],
      structuredContent: normalized,
    };
  }
);

server.registerTool(
  "get_user_favorite_stations",
  {
    title: "Get user favorite stations",
    description: "Obtiene favoritos del usuario y opcionalmente hidrata con detalle de gasolinera",
    inputSchema: {
      authToken: z.string().optional().describe("JWT Bearer del usuario. Si no se envía, usa DEFAULT_USER_BEARER_TOKEN"),
      includeStations: z.boolean().default(true),
      limit: z.number().int().positive().max(50).default(10),
    },
  },
  async ({ authToken, includeStations = true, limit = 10 }) => {
    const favorites = await fetchJson("/api/usuarios/favoritos", {
      headers: buildUserAuthHeader(authToken),
    });
    const favoritesList = Array.isArray(favorites) ? favorites.slice(0, limit) : [];
    let stations = [];

    if (includeStations) {
      const detailPromises = favoritesList.map(async (fav) => {
        const id = fav?.ideess;
        if (!id) return null;
        try {
          const station = await fetchJson(`/api/gasolineras/${encodeURIComponent(id)}`);
          return {
            ideess: id,
            created_at: fav?.created_at || null,
            station,
          };
        } catch {
          return {
            ideess: id,
            created_at: fav?.created_at || null,
            station: null,
          };
        }
      });
      stations = (await Promise.all(detailPromises)).filter(Boolean);
    }

    const result = {
      count: favoritesList.length,
      favorites: favoritesList,
      stations,
      hydrated: includeStations,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }
);

server.registerTool(
  "find_nearest_for_user_preference",
  {
    title: "Find nearest for user preference",
    description: "Busca la gasolinera más cercana y devuelve el precio del combustible preferido del usuario",
    inputSchema: {
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      km: z.number().positive().max(200).default(8),
      limit: z.number().int().positive().max(50).default(10),
      authToken: z.string().optional().describe("JWT Bearer del usuario. Si no se envía, usa DEFAULT_USER_BEARER_TOKEN"),
      fallbackFuel: z.enum(["gasolina95", "gasolina98", "gasoleoA", "gasoleoB", "gasoleoPremium"]).default("gasolina95"),
    },
  },
  async ({ lat, lon, km = 8, limit = 10, authToken, fallbackFuel = "gasolina95" }) => {
    const [nearbyData, userProfile] = await Promise.all([
      fetchJson(buildGatewayPath("/api/gasolineras/cerca", { lat, lon, km, limit })),
      getUserProfileOrNull(authToken),
    ]);

    const stations = Array.isArray(nearbyData.gasolineras) ? nearbyData.gasolineras : [];
    const nearest = stations.length > 0 ? stations[0] : null;
    const fuelInfo = resolveFuelFieldFromUser(userProfile, fallbackFuel);

    const result = {
      location: { lat, lon, km },
      stationFound: Boolean(nearest),
      fuel: fuelInfo.fuel,
      fuelField: fuelInfo.fuelField,
      fromUserPreference: fuelInfo.fromUserPreference,
      user: userProfile
        ? {
            id: userProfile.id,
            nombre: userProfile.nombre,
            combustible_favorito: userProfile.combustible_favorito,
          }
        : null,
      nearest: nearest
        ? {
            station: nearest,
            preferredFuelPrice: parsePrice(nearest?.[fuelInfo.fuelField]),
            preferredFuelPriceRaw: nearest?.[fuelInfo.fuelField] || null,
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
  "find_nearest_favorite_station",
  {
    title: "Find nearest favorite station",
    description: "Busca la favorita del usuario más cercana a una coordenada",
    inputSchema: {
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      km: z.number().positive().max(200).default(15),
      authToken: z.string().optional().describe("JWT Bearer del usuario. Si no se envía, usa DEFAULT_USER_BEARER_TOKEN"),
    },
  },
  async ({ lat, lon, km = 15, authToken }) => {
    const [nearbyData, favorites] = await Promise.all([
      fetchJson(buildGatewayPath("/api/gasolineras/cerca", { lat, lon, km, limit: 150 })),
      getUserFavoritesOrEmpty(authToken),
    ]);

    const favoriteIds = new Set((favorites || []).map((f) => String(f?.ideess || "")).filter(Boolean));
    const stations = Array.isArray(nearbyData.gasolineras) ? nearbyData.gasolineras : [];
    const nearbyFavorites = stations.filter((s) => favoriteIds.has(String(s?.IDEESS || "")));
    const nearestFavorite = nearbyFavorites.length > 0 ? nearbyFavorites[0] : null;

    const result = {
      location: { lat, lon, km },
      favoritesTotal: favoriteIds.size,
      nearbyFavoritesCount: nearbyFavorites.length,
      nearestFavorite,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }
);

server.registerTool(
  "find_best_price_distance_for_user",
  {
    title: "Find best price-distance for user",
    description: "Encuentra la mejor opción equilibrando precio y distancia según combustible preferido del usuario",
    inputSchema: {
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      km: z.number().positive().max(200).default(15),
      authToken: z.string().optional().describe("JWT Bearer del usuario. Si no se envía, usa DEFAULT_USER_BEARER_TOKEN"),
      fallbackFuel: z.enum(["gasolina95", "gasolina98", "gasoleoA", "gasoleoB", "gasoleoPremium"]).default("gasolina95"),
      limit: z.number().int().positive().max(200).default(100),
    },
  },
  async ({ lat, lon, km = 15, authToken, fallbackFuel = "gasolina95", limit = 100 }) => {
    const [nearbyData, userProfile, favorites] = await Promise.all([
      fetchJson(buildGatewayPath("/api/gasolineras/cerca", { lat, lon, km, limit })),
      getUserProfileOrNull(authToken),
      getUserFavoritesOrEmpty(authToken),
    ]);

    const fuelInfo = resolveFuelFieldFromUser(userProfile, fallbackFuel);
    const stations = Array.isArray(nearbyData.gasolineras) ? nearbyData.gasolineras : [];
    const favoriteIds = new Set((favorites || []).map((f) => String(f?.ideess || "")).filter(Boolean));
    const ranked = rankByPriceAndDistance(stations, fuelInfo.fuelField, favoriteIds);

    const result = {
      location: { lat, lon, km },
      fuel: fuelInfo.fuel,
      fuelField: fuelInfo.fuelField,
      fromUserPreference: fuelInfo.fromUserPreference,
      consideredCandidates: ranked.length,
      best: ranked[0]
        ? {
            score: ranked[0].score,
            price: ranked[0].price,
            distanceKm: ranked[0].distanceKm,
            isFavorite: ranked[0].isFavorite,
            station: ranked[0].station,
          }
        : null,
      top3: ranked.slice(0, 3).map((r) => ({
        score: r.score,
        price: r.price,
        distanceKm: r.distanceKm,
        isFavorite: r.isFavorite,
        station: r.station,
      })),
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
