const GATEWAY_BASE_URL = (process.env.GATEWAY_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

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

export async function getNearestStation({ lat, lon, km = 8, limit = 5 }) {
  const data = await fetchJson(`/api/gasolineras/cerca?lat=${lat}&lon=${lon}&km=${km}&limit=${limit}`);
  const station = Array.isArray(data.gasolineras) && data.gasolineras.length > 0 ? data.gasolineras[0] : null;
  return { station, source: "gateway-rest" };
}

export async function ensureFreshSnapshot() {
  const data = await fetchJson("/api/gasolineras/ensure-fresh", {
    method: "POST",
    headers: {
      "X-Internal-Secret": INTERNAL_API_SECRET,
    },
    body: JSON.stringify({}),
  });
  return data;
}
