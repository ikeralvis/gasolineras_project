import { voiceEnv } from "../config/env.js";

function sanitizePrice(value) {
  if (value == null) {
    return null;
  }
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

async function fetchJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), voiceEnv.gateway.timeoutMs);

  let response;
  try {
    response = await fetch(`${voiceEnv.gateway.baseUrl}${path}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`gateway-context failed ${response.status}`);
  }

  return data;
}

function buildContextFromStation(station) {
  if (!station || typeof station !== "object") {
    return null;
  }

  const prices = {
    gasolina95: sanitizePrice(station["Precio Gasolina 95 E5"]),
    gasolina98: sanitizePrice(station["Precio Gasolina 98 E5"]),
    gasoleoA: sanitizePrice(station["Precio Gasoleo A"]),
    gasoleoPremium: sanitizePrice(station["Precio Gasoleo Premium"]),
  };

  const stationNameKey = Object.keys(station).find((key) => {
    const normalized = key
      .toLowerCase()
      .normalize("NFD")
      .replaceAll(/[\u0300-\u036f]/g, "");
    return normalized === "rotulo";
  });

  const stationName = stationNameKey ? String(station[stationNameKey] || "") : "";

  const data = {
    stationName,
    address: station.Direccion || "",
    municipality: station.Municipio || "",
    province: station.Provincia || "",
    distanceKm: station.distancia_km || station.distanciaKm || null,
    prices,
  };

  const distanceText =
    data.distanceKm === null || data.distanceKm === undefined
      ? null
      : `Distancia aproximada: ${data.distanceKm} km.`;

  const promptContext = [
    `Estacion mas cercana: ${stationName || "sin nombre"}.`,
    `Direccion: ${data.address || "desconocida"}, ${data.municipality || ""} ${data.province || ""}.`,
    distanceText,
    prices.gasolina95 ? `Gasolina 95: ${prices.gasolina95} EUR/l.` : null,
    prices.gasoleoA ? `Gasoleo A: ${prices.gasoleoA} EUR/l.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    data,
    promptContext,
  };
}

export async function getNearestStationContext({ location }) {
  if (!voiceEnv.gateway.enableGasContext) {
    return null;
  }

  if (!location || typeof location !== "object") {
    return null;
  }

  const lat = Number(location.lat);
  const lon = Number(location.lon);
  const requestedKm = Number(location.km || 8);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (!Number.isFinite(requestedKm) || requestedKm <= 0 || requestedKm > voiceEnv.gateway.maxKm) {
    return null;
  }

  const data = await fetchJson(`/api/gasolineras/cerca?lat=${lat}&lon=${lon}&km=${requestedKm}&limit=1`);
  const station = Array.isArray(data?.gasolineras) ? data.gasolineras[0] : null;
  return buildContextFromStation(station);
}
