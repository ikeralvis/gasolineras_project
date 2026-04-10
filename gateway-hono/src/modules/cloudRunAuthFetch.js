const CLOUD_RUN_SERVICE_AUTH_ENABLED =
  (process.env.CLOUD_RUN_SERVICE_AUTH_ENABLED || "true").toLowerCase() === "true";
const CLOUD_RUN_AUTH_TIMEOUT_MS = Number(process.env.CLOUD_RUN_AUTH_TIMEOUT_MS || 1800);

const tokenCache = new Map();

function isCloudRunServiceUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".run.app");
  } catch {
    return false;
  }
}

function decodeJwtExpiryMs(token) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded?.exp) return null;
    return Number(decoded.exp) * 1000;
  } catch {
    return null;
  }
}

async function fetchIdTokenFromMetadata(audience) {
  const cached = tokenCache.get(audience);
  if (cached && cached.expiresAtMs - Date.now() > 60_000) {
    return cached.token;
  }

  const metadataUrl =
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity" +
    `?audience=${encodeURIComponent(audience)}&format=full`;

  const response = await fetch(metadataUrl, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(CLOUD_RUN_AUTH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`metadata token HTTP ${response.status}`);
  }

  const token = (await response.text()).trim();
  const expiresAtMs = decodeJwtExpiryMs(token) || Date.now() + 5 * 60 * 1000;
  tokenCache.set(audience, { token, expiresAtMs });
  return token;
}

async function buildHeadersWithCloudRunAuth(url, inputHeaders = {}) {
  const headers = { ...inputHeaders };

  if (!CLOUD_RUN_SERVICE_AUTH_ENABLED || !isCloudRunServiceUrl(url)) {
    return headers;
  }

  if (headers["X-Serverless-Authorization"] || headers["x-serverless-authorization"]) {
    return headers;
  }

  const audience = new URL(url).origin;
  const idToken = await fetchIdTokenFromMetadata(audience);
  headers["X-Serverless-Authorization"] = `Bearer ${idToken}`;
  return headers;
}

export async function fetchWithCloudRunAuth(url, options = {}) {
  const headers = await buildHeadersWithCloudRunAuth(url, options.headers || {});
  return fetch(url, {
    ...options,
    headers,
  });
}
