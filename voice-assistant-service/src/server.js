import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { ensureFreshSnapshot, getNearestStation } from "./adapters/gatewayTools.js";
import { detectIntentWithOpenAI } from "./adapters/intentRouterOpenAI.js";
import { buildAnswerWithOpenAI } from "./adapters/llmOpenAI.js";
import { transcribeWithOpenAI } from "./adapters/sttOpenAI.js";
import { synthesizeSpeechWithOpenAI } from "./adapters/ttsOpenAI.js";

const app = Fastify({
  logger: false,
  bodyLimit: 12 * 1024 * 1024,
});
const PORT = Number(process.env.PORT || 8090);
const VOICE_RATE_LIMIT_WINDOW_MS = Number(process.env.VOICE_RATE_LIMIT_WINDOW_MS || 60000);
const VOICE_RATE_LIMIT_MAX_REQUESTS = Number(process.env.VOICE_RATE_LIMIT_MAX_REQUESTS || 40);
const VOICE_MAX_TEXT_CHARS = Number(process.env.VOICE_MAX_TEXT_CHARS || 450);
const VOICE_MAX_AUDIO_BASE64_CHARS = Number(process.env.VOICE_MAX_AUDIO_BASE64_CHARS || 5500000);
const VOICE_MAX_KM = Number(process.env.VOICE_MAX_KM || 25);
const VOICE_ENABLE_TTS_AUDIO = String(process.env.VOICE_ENABLE_TTS_AUDIO || "true").toLowerCase() === "true";
const VOICE_ALLOWED_ORIGINS = String(process.env.VOICE_ALLOWED_ORIGINS || "*");

const FUEL_FIELDS = [
  "Precio Gasolina 95 E5",
  "Precio Gasolina 98 E5",
  "Precio Gasoleo A",
  "Precio Gasoleo B",
  "Precio Gasoleo Premium",
];

function priceToSpeech(rawValue) {
  if (rawValue == null) return null;
  const source = String(rawValue).trim().replace(",", ".");
  const match = /\d+(?:\.\d+)?/.exec(source);
  if (!match) return null;

  const [eurosPart, decimalsPart = ""] = match[0].split(".");
  const euros = Number.parseInt(eurosPart, 10);
  if (!Number.isFinite(euros)) return null;

  const centsRaw = `${decimalsPart}00`.slice(0, 2);
  const cents = Number.parseInt(centsRaw, 10);
  if (!Number.isFinite(cents)) return null;

  const euroWord = euros === 1 ? "euro" : "euros";
  const centsWord = cents === 1 ? "centimo" : "centimos";
  return `${euros} ${euroWord} con ${cents} ${centsWord} por litro`;
}

function buildNearestSpeechHints(station) {
  if (!station || typeof station !== "object") {
    return null;
  }

  const pricesWhenSpeaking = {};
  for (const field of FUEL_FIELDS) {
    const normalized = priceToSpeech(station[field]);
    if (normalized) {
      pricesWhenSpeaking[field] = normalized;
    }
  }

  return {
    stationName: station.Rótulo || station.Rotulo || station.rotulo || "",
    pricesWhenSpeaking,
    pronunciationRule: "Cuando veas precios tipo 1,585, leelo como decimal: 1 euro con 58 centimos por litro.",
  };
}

const requestCounters = new Map();

class VoiceRequestError extends Error {
  constructor(statusCode, errorCode, message, extras = {}) {
    super(message || errorCode);
    this.name = "VoiceRequestError";
    this.statusCode = statusCode;
    this.error = errorCode;
    Object.assign(this, extras);
  }
}

function createRequestId() {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractClientIp(headers = {}, socket = null) {
  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0 && typeof forwarded[0] === "string") {
    return forwarded[0].split(",")[0].trim();
  }
  return socket?.remoteAddress || "unknown";
}

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = requestCounters.get(ip) || [];
  const fresh = bucket.filter((ts) => now - ts < VOICE_RATE_LIMIT_WINDOW_MS);

  if (fresh.length >= VOICE_RATE_LIMIT_MAX_REQUESTS) {
    return {
      limited: true,
      error: "rate-limit-exceeded",
      message: "Too many requests. Try again later.",
      windowMs: VOICE_RATE_LIMIT_WINDOW_MS,
      maxRequests: VOICE_RATE_LIMIT_MAX_REQUESTS,
      statusCode: 429,
    };
  }

  fresh.push(now);
  requestCounters.set(ip, fresh);
  return { limited: false };
}

function parseAuthTokenFromHeader(authHeader = "") {
  if (typeof authHeader !== "string") {
    return null;
  }
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
}

function allowedOriginMatcher(origin) {
  if (VOICE_ALLOWED_ORIGINS.trim() === "*") {
    return true;
  }
  if (!origin) {
    return true;
  }
  const allowed = VOICE_ALLOWED_ORIGINS
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

function createError(error, fallbackCode = 500, fallbackMessage = "internal-error") {
  const message = error?.message || fallbackMessage;
  const normalized = {
    statusCode: Number(error?.statusCode || fallbackCode),
    error: error?.error || fallbackMessage,
    message,
  };
  if (error?.maxChars !== undefined) {
    normalized.maxChars = error.maxChars;
  }
  if (error?.maxKm !== undefined) {
    normalized.maxKm = error.maxKm;
  }
  if (error?.maxBase64Chars !== undefined) {
    normalized.maxBase64Chars = error.maxBase64Chars;
  }
  return normalized;
}

async function handleTranscribe(payload, requestId) {
  const { audioBase64, mimeType, language, prompt } = payload || {};
  console.log(`[voice][${requestId}] transcribe incoming mime=${mimeType || "audio/webm"} language=${language || "es"} base64Len=${typeof audioBase64 === "string" ? audioBase64.length : 0}`);

  if (!audioBase64 || typeof audioBase64 !== "string") {
    throw new VoiceRequestError(400, "audioBase64-required", "audioBase64 is required");
  }
  if (audioBase64.length > VOICE_MAX_AUDIO_BASE64_CHARS) {
    throw new VoiceRequestError(413, "audio-too-large", "audio is too large", {
      maxBase64Chars: VOICE_MAX_AUDIO_BASE64_CHARS,
    });
  }

  const result = await transcribeWithOpenAI({ audioBase64, mimeType, language, prompt });
  console.log(`[voice][${requestId}] transcribe ok textLen=${(result?.text || "").length}`);
  return result;
}

async function handleIntent(payload, requestId, authToken = null) {
  const { text, location, includeAudio = false } = payload || {};
  console.log(`[voice][${requestId}] intent incoming textLen=${typeof text === "string" ? text.length : 0} includeAudio=${Boolean(includeAudio)}`);

  if (!text || typeof text !== "string") {
    throw new VoiceRequestError(400, "text-required", "text is required");
  }
  if (text.length > VOICE_MAX_TEXT_CHARS) {
    throw new VoiceRequestError(400, "text-too-long", "text is too long", {
      maxChars: VOICE_MAX_TEXT_CHARS,
    });
  }

  const routed = await detectIntentWithOpenAI(text);
  const intent = routed.intent;
  console.log(`[voice][${requestId}] intent routed=${intent} provider=${routed.provider} confidence=${routed.confidence}`);
  let toolResult = { intent, handled: false, routedBy: routed.provider, confidence: routed.confidence };

  if (intent === "nearest") {
    if (!location || typeof location.lat !== "number" || typeof location.lon !== "number") {
      throw new VoiceRequestError(
        400,
        "location-required",
        "location.lat and location.lon are required for nearest intent"
      );
    }

    const requestedKm = Number(location.km || 8);
    if (!Number.isFinite(requestedKm) || requestedKm <= 0 || requestedKm > VOICE_MAX_KM) {
      throw new VoiceRequestError(400, "km-out-of-range", "km-out-of-range", {
        maxKm: VOICE_MAX_KM,
      });
    }

    await ensureFreshSnapshot().catch(() => null);
    const nearest = await getNearestStation({
      lat: location.lat,
      lon: location.lon,
      km: requestedKm,
      limit: 5,
      authToken,
    });

    toolResult = {
      intent,
      handled: true,
      ...nearest,
      speechHints: buildNearestSpeechHints(nearest?.station),
    };
  }

  const answer = await buildAnswerWithOpenAI({
    userText: text,
    toolResult,
  });

  const tts = await synthesizeSpeechWithOpenAI(answer.text, {
    includeAudio: includeAudio && VOICE_ENABLE_TTS_AUDIO,
  });

  console.log(`[voice][${requestId}] intent ok answerLen=${(answer?.text || "").length} audio=${Boolean(tts?.audioBase64)}`);

  return {
    intent,
    toolResult,
    answer,
    tts,
  };
}

function wsSend(socket, payload) {
  try {
    socket.send(JSON.stringify(payload));
  } catch (error) {
    console.warn("[voice][ws] send failed", error?.message || error);
  }
}

await app.register(cors, {
  origin: (origin, cb) => {
    cb(null, allowedOriginMatcher(origin));
  },
  credentials: true,
});

await app.register(websocket);

app.get("/health", async () => ({ status: "ok", service: "voice-assistant-service", transport: ["http", "ws"] }));

app.get("/ws/voice", { websocket: true }, (connection, req) => {
  const socket = connection.socket;
  const origin = req.headers.origin;
  if (!allowedOriginMatcher(origin)) {
    wsSend(socket, {
      type: "error",
      error: "origin-not-allowed",
      message: "Origin is not allowed for websocket connection",
    });
    socket.close(1008, "origin-not-allowed");
    return;
  }

  const ip = extractClientIp(req.headers, req.socket);
  const authToken = parseAuthTokenFromHeader(req.headers.authorization || "");
  const connectionId = createRequestId();

  wsSend(socket, {
    type: "ready",
    connectionId,
    service: "voice-assistant-service",
    transport: "websocket",
  });

  let queue = Promise.resolve();

  socket.on("message", (raw) => {
    queue = queue
      .then(async () => {
        const requestId = createRequestId();
        let message;
        try {
          message = JSON.parse(String(raw || ""));
        } catch (error) {
          console.warn("[voice][ws] invalid-json", error?.message || error);
          wsSend(socket, {
            type: "response",
            ok: false,
            error: "invalid-json",
            message: "Payload must be valid JSON",
          });
          return;
        }

        const id = message?.id || createRequestId();
        const action = message?.action;
        const payload = message?.payload || {};

        const limit = checkRateLimit(ip);
        if (limit.limited) {
          wsSend(socket, {
            type: "response",
            id,
            action,
            ok: false,
            ...limit,
          });
          return;
        }

        if (action === "ping") {
          wsSend(socket, {
            type: "response",
            id,
            action,
            ok: true,
            data: { pong: true, ts: Date.now() },
          });
          return;
        }

        try {
          let data;
          if (action === "transcribe") {
            data = await handleTranscribe(payload, requestId);
          } else if (action === "intent") {
            data = await handleIntent(payload, requestId, authToken);
          } else {
            throw new VoiceRequestError(400, "unsupported-action", `Unknown action: ${action}`);
          }

          wsSend(socket, {
            type: "response",
            id,
            action,
            ok: true,
            data,
          });
        } catch (error) {
          const normalized = createError(error, 500, "internal-error");
          wsSend(socket, {
            type: "response",
            id,
            action,
            ok: false,
            ...normalized,
          });
        }
      })
      .catch((error) => {
        console.error("[voice][ws] queue error", error?.message || error);
      });
  });
});

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`[voice-assistant-service] fastify+ws listening on :${PORT}`);
} catch (error) {
  console.error("[voice-assistant-service] startup error", error);
  process.exit(1);
}
