import express from "express";
import { ensureFreshSnapshot, getNearestStation } from "./adapters/gatewayTools.js";
import { detectIntentWithOpenAI } from "./adapters/intentRouterOpenAI.js";
import { buildAnswerWithOpenAI } from "./adapters/llmOpenAI.js";
import { transcribeWithOpenAI } from "./adapters/sttOpenAI.js";
import { synthesizeSpeechWithOpenAI } from "./adapters/ttsOpenAI.js";

const app = express();
const PORT = Number(process.env.PORT || 8090);
const VOICE_RATE_LIMIT_WINDOW_MS = Number(process.env.VOICE_RATE_LIMIT_WINDOW_MS || 60000);
const VOICE_RATE_LIMIT_MAX_REQUESTS = Number(process.env.VOICE_RATE_LIMIT_MAX_REQUESTS || 40);
const VOICE_MAX_TEXT_CHARS = Number(process.env.VOICE_MAX_TEXT_CHARS || 450);
const VOICE_MAX_AUDIO_BASE64_CHARS = Number(process.env.VOICE_MAX_AUDIO_BASE64_CHARS || 5500000);
const VOICE_MAX_KM = Number(process.env.VOICE_MAX_KM || 25);
const VOICE_ENABLE_TTS_AUDIO = String(process.env.VOICE_ENABLE_TTS_AUDIO || "true").toLowerCase() === "true";

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
  const match = source.match(/\d+(?:\.\d+)?/);
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

app.use(express.json({ limit: "12mb" }));

app.use((req, res, next) => {
  const requestId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

app.use((req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = requestCounters.get(ip) || [];
  const fresh = bucket.filter((ts) => now - ts < VOICE_RATE_LIMIT_WINDOW_MS);

  if (fresh.length >= VOICE_RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: "rate-limit-exceeded",
      message: "Too many requests. Try again later.",
      windowMs: VOICE_RATE_LIMIT_WINDOW_MS,
      maxRequests: VOICE_RATE_LIMIT_MAX_REQUESTS,
    });
  }

  fresh.push(now);
  requestCounters.set(ip, fresh);
  return next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "voice-assistant-service" });
});

app.post("/voice/transcribe", async (req, res) => {
  try {
    const { audioBase64, mimeType, language, prompt } = req.body || {};
    console.log(`[voice][${req.requestId}] /voice/transcribe incoming mime=${mimeType || "audio/webm"} language=${language || "es"} base64Len=${typeof audioBase64 === "string" ? audioBase64.length : 0}`);
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return res.status(400).json({ error: "audioBase64 is required" });
    }
    if (audioBase64.length > VOICE_MAX_AUDIO_BASE64_CHARS) {
      return res.status(413).json({
        error: "audio-too-large",
        maxBase64Chars: VOICE_MAX_AUDIO_BASE64_CHARS,
      });
    }

    const result = await transcribeWithOpenAI({ audioBase64, mimeType, language, prompt });
    console.log(`[voice][${req.requestId}] /voice/transcribe ok textLen=${(result?.text || "").length}`);
    return res.json(result);
  } catch (error) {
    console.error(`[voice][${req.requestId}] /voice/transcribe error`, error.message || error);
    return res.status(400).json({ error: error.message || "transcription-error" });
  }
});

app.post("/voice/intent", async (req, res) => {
  try {
    const { text, location, includeAudio = false } = req.body || {};
    console.log(`[voice][${req.requestId}] /voice/intent incoming textLen=${typeof text === "string" ? text.length : 0} includeAudio=${Boolean(includeAudio)}`);
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }
    if (text.length > VOICE_MAX_TEXT_CHARS) {
      return res.status(400).json({
        error: "text-too-long",
        maxChars: VOICE_MAX_TEXT_CHARS,
      });
    }

    const routed = await detectIntentWithOpenAI(text);
    const intent = routed.intent;
    console.log(`[voice][${req.requestId}] intent routed=${intent} provider=${routed.provider} confidence=${routed.confidence}`);
    let toolResult = { intent, handled: false, routedBy: routed.provider, confidence: routed.confidence };

    if (intent === "nearest") {
      if (!location || typeof location.lat !== "number" || typeof location.lon !== "number") {
        return res.status(400).json({
          error: "location.lat and location.lon are required for nearest intent",
        });
      }

      const requestedKm = Number(location.km || 8);
      if (!Number.isFinite(requestedKm) || requestedKm <= 0 || requestedKm > VOICE_MAX_KM) {
        return res.status(400).json({
          error: "km-out-of-range",
          maxKm: VOICE_MAX_KM,
        });
      }

      await ensureFreshSnapshot().catch(() => null);
      const nearest = await getNearestStation({
        lat: location.lat,
        lon: location.lon,
        km: requestedKm,
        limit: 5,
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

    console.log(`[voice][${req.requestId}] /voice/intent ok answerLen=${(answer?.text || "").length} audio=${Boolean(tts?.audioBase64)}`);

    return res.json({
      intent,
      toolResult,
      answer,
      tts,
    });
  } catch (error) {
    console.error(`[voice][${req.requestId}] /voice/intent error`, error.message || error);
    return res.status(500).json({ error: error.message || "internal-error" });
  }
});

app.listen(PORT, () => {
  console.log(`[voice-assistant-service] listening on :${PORT}`);
});
