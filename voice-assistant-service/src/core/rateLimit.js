export function createRateLimiter({ windowMs, maxRequests }) {
  const requestCounters = new Map();

  function check(ip) {
    const now = Date.now();
    const bucket = requestCounters.get(ip) || [];
    const fresh = bucket.filter((ts) => now - ts < windowMs);

    if (fresh.length >= maxRequests) {
      return {
        limited: true,
        error: "rate-limit-exceeded",
        message: "Too many requests. Try again later.",
        windowMs,
        maxRequests,
        statusCode: 429,
      };
    }

    fresh.push(now);
    requestCounters.set(ip, fresh);
    return { limited: false };
  }

  function clear() {
    requestCounters.clear();
  }

  return {
    check,
    clear,
  };
}
