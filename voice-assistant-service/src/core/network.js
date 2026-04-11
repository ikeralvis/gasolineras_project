export function createRequestId(prefix = "voice") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function extractClientIp(headers = {}, socket = null) {
  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0 && typeof forwarded[0] === "string") {
    return forwarded[0].split(",")[0].trim();
  }
  return socket?.remoteAddress || "unknown";
}

export function parseAuthTokenFromHeader(authHeader = "") {
  if (typeof authHeader !== "string") {
    return null;
  }
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
}

export function createAllowedOriginMatcher(allowedOriginsRaw, allowedOrigins) {
  const wildcard = String(allowedOriginsRaw || "").trim() === "*" || allowedOrigins.includes("*");

  return (origin) => {
    if (wildcard) {
      return true;
    }
    if (!origin) {
      return true;
    }
    return allowedOrigins.includes(origin);
  };
}

export function wsSend(socket, payload) {
  try {
    socket.send(JSON.stringify(payload));
  } catch (error) {
    console.warn("[voice][ws] send failed", error?.message || error);
  }
}
