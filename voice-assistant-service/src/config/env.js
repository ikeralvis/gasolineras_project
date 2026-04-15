function asNumber(value, fallbackValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function asBoolean(value, fallbackValue) {
  if (value == null) {
    return fallbackValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallbackValue;
}

function asEnum(value, allowed, fallbackValue) {
  if (value == null) {
    return fallbackValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallbackValue;
}

function asCsv(value, fallbackValue = []) {
  if (!value || String(value).trim() === "") {
    return fallbackValue;
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return "";
}

export const voiceEnv = Object.freeze({
  port: asNumber(process.env.PORT, 8090),

  rateLimitWindowMs: asNumber(process.env.VOICE_RATE_LIMIT_WINDOW_MS, 60000),
  rateLimitMaxRequests: asNumber(process.env.VOICE_RATE_LIMIT_MAX_REQUESTS, 40),
  maxTextChars: asNumber(process.env.VOICE_MAX_TEXT_CHARS, 450),
  maxAudioBase64Chars: asNumber(process.env.VOICE_MAX_AUDIO_BASE64_CHARS, 5500000),
  maxStreamChunks: asNumber(process.env.VOICE_MAX_STREAM_CHUNKS, 32),

  includeLatencyMeta: asBoolean(process.env.VOICE_INCLUDE_LATENCY_META, true),
  includeAudioByDefault: asBoolean(process.env.VOICE_INCLUDE_AUDIO_BY_DEFAULT, true),

  wsHeartbeatIntervalMs: asNumber(process.env.VOICE_WS_HEARTBEAT_INTERVAL_MS, 25000),
  wsIdleTimeoutMs: asNumber(process.env.VOICE_WS_IDLE_TIMEOUT_MS, 240000),

  allowedOriginsRaw: String(process.env.VOICE_ALLOWED_ORIGINS || "*"),
  allowedOrigins: asCsv(process.env.VOICE_ALLOWED_ORIGINS, ["*"]),

  gemini: {
    apiKey: pickFirstNonEmpty(process.env.GOOGLE_API_KEY, process.env.GEMINI_API_KEY),
    dialogModel: process.env.GEMINI_DIALOG_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
    ttsModel: process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts",
    voiceName: process.env.GEMINI_VOICE_NAME || "Aoede",
    timeoutMs: asNumber(process.env.GEMINI_TIMEOUT_MS, 15000),
    maxOutputTokens: asNumber(process.env.GEMINI_MAX_OUTPUT_TOKENS, 512),
    temperature: asNumber(process.env.GEMINI_TEMPERATURE, 0.35),
    language: process.env.GEMINI_LANGUAGE || "es-ES",
  },

  gateway: {
    enableGasContext: asBoolean(process.env.VOICE_ENABLE_GAS_CONTEXT, false),
    baseUrl: (process.env.GATEWAY_BASE_URL || "http://gateway:8080").replace(/\/$/, ""),
    timeoutMs: asNumber(process.env.VOICE_GATEWAY_TIMEOUT_MS, 5000),
    maxKm: asNumber(process.env.VOICE_MAX_KM, 25),
    internalSecret: process.env.INTERNAL_API_SECRET || "",
  },
});

export function getPublicVoiceConfig() {
  return {
    provider: "pipeline",
    pipeline: { stt: "gemini", llm: "gemini", tts: "gemini" },
    dialogModel: voiceEnv.gemini.dialogModel,
    ttsModel: voiceEnv.gemini.ttsModel,
    language: voiceEnv.gemini.language,
    includeLatencyMeta: voiceEnv.includeLatencyMeta,
    includeAudioByDefault: voiceEnv.includeAudioByDefault,
    wsHeartbeatIntervalMs: voiceEnv.wsHeartbeatIntervalMs,
    wsIdleTimeoutMs: voiceEnv.wsIdleTimeoutMs,
    enableGasContext: voiceEnv.gateway.enableGasContext,
    limits: {
      maxTextChars: voiceEnv.maxTextChars,
      maxAudioBase64Chars: voiceEnv.maxAudioBase64Chars,
      maxKm: voiceEnv.gateway.maxKm,
      maxStreamChunks: voiceEnv.maxStreamChunks,
    },
  };
}
