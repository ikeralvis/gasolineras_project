import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { getPublicVoiceConfig, voiceEnv } from "./config/env.js";
import { normalizeError, VoiceRequestError } from "./core/errors.js";
import {
  createAllowedOriginMatcher,
  createRequestId,
  extractClientIp,
  parseAuthTokenFromHeaders,
  wsSend,
} from "./core/network.js";
import { createRateLimiter } from "./core/rateLimit.js";
import { runPipelineDialog } from "./adapters/pipelineDialog.js";

const app = Fastify({
  logger: false,
  bodyLimit: 20 * 1024 * 1024,
});

const rateLimiter = createRateLimiter({
  windowMs: voiceEnv.rateLimitWindowMs,
  maxRequests: voiceEnv.rateLimitMaxRequests,
});

const isAllowedOrigin = createAllowedOriginMatcher(
  voiceEnv.allowedOriginsRaw,
  voiceEnv.allowedOrigins
);

function createWatchdog(socket, connectionId) {
  let lastActivityTs = Date.now();

  const heartbeatInterval = setInterval(() => {
    wsSend(socket, {
      type: "server-ping",
      connectionId,
      ts: Date.now(),
    });
  }, voiceEnv.wsHeartbeatIntervalMs);

  const idleInterval = setInterval(() => {
    const idleMs = Date.now() - lastActivityTs;
    if (idleMs >= voiceEnv.wsIdleTimeoutMs) {
      wsSend(socket, {
        type: "info",
        event: "idle-timeout",
        idleMs,
        connectionId,
      });
      socket.close(1000, "idle-timeout");
    }
  }, Math.min(voiceEnv.wsHeartbeatIntervalMs, 5000));

  return {
    touch() {
      lastActivityTs = Date.now();
    },
    dispose() {
      clearInterval(heartbeatInterval);
      clearInterval(idleInterval);
    },
  };
}

function combineBase64Chunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return "";
  }

  const buffers = chunks.map((chunk) => Buffer.from(chunk, "base64"));
  return Buffer.concat(buffers).toString("base64");
}

function validateDialogPayload(payload) {
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  const audioBase64 = typeof payload?.audioBase64 === "string" ? payload.audioBase64 : "";

  if (!text && !audioBase64) {
    throw new VoiceRequestError(400, "audio-or-text-required", "audioBase64 or text is required");
  }

  if (text.length > voiceEnv.maxTextChars) {
    throw new VoiceRequestError(400, "text-too-long", "text is too long", {
      maxChars: voiceEnv.maxTextChars,
    });
  }

  if (audioBase64.length > voiceEnv.maxAudioBase64Chars) {
    throw new VoiceRequestError(413, "audio-too-large", "audio is too large", {
      maxBase64Chars: voiceEnv.maxAudioBase64Chars,
    });
  }

  return {
    text,
    audioBase64,
    mimeType: typeof payload?.mimeType === "string" ? payload.mimeType : "audio/webm",
    includeAudio:
      typeof payload?.includeAudio === "boolean"
        ? payload.includeAudio
        : voiceEnv.includeAudioByDefault,
    location: payload?.location || null,
  };
}

async function handleDialog(payload, authToken) {
  const dialog = validateDialogPayload(payload);

  return runPipelineDialog({
    text: dialog.text,
    audioBase64: dialog.audioBase64,
    mimeType: dialog.mimeType,
    includeAudio: dialog.includeAudio,
    location: dialog.location,
    authToken,
  });
}

function appendAudioChunkToBuffer(streamState, payload) {
  if (typeof payload?.audioBase64 !== "string" || payload.audioBase64.length === 0) {
    throw new VoiceRequestError(400, "audioBase64-required", "audioBase64 is required for audio_chunk");
  }
  if (payload.audioBase64.length > voiceEnv.maxAudioBase64Chars) {
    throw new VoiceRequestError(413, "audio-too-large", "audio chunk is too large", {
      maxBase64Chars: voiceEnv.maxAudioBase64Chars,
    });
  }
  if (streamState.chunks.length >= voiceEnv.maxStreamChunks) {
    throw new VoiceRequestError(413, "stream-buffer-full", "stream buffer is full", {
      maxChunks: voiceEnv.maxStreamChunks,
    });
  }

  streamState.chunks.push(payload.audioBase64);
  if (typeof payload?.mimeType === "string" && payload.mimeType.trim()) {
    streamState.mimeType = payload.mimeType;
  }

  return {
    bufferedChunks: streamState.chunks.length,
    mimeType: streamState.mimeType,
  };
}

async function resolveVoiceAction({ action, payload, authToken, streamState }) {
  if (action === "dialog") {
    return handleDialog(payload, authToken);
  }

  if (action === "audio_chunk") {
    return appendAudioChunkToBuffer(streamState, payload);
  }

  if (action === "audio_commit") {
    const mergedAudioBase64 = combineBase64Chunks(streamState.chunks);
    streamState.chunks = [];

    return handleDialog(
      {
        ...payload,
        audioBase64: mergedAudioBase64,
        mimeType: payload?.mimeType || streamState.mimeType,
      },
      authToken
    );
  }

  if (action === "clear_buffer") {
    streamState.chunks = [];
    return {
      cleared: true,
    };
  }

  throw new VoiceRequestError(400, "unsupported-action", `Unknown action: ${action}`);
}

await app.register(cors, {
  origin: (origin, cb) => {
    cb(null, isAllowedOrigin(origin));
  },
  credentials: true,
});

await app.register(websocket);

app.get("/health", async () => ({
  status: "ok",
  service: "voice-assistant-service",
  transport: ["http", "ws"],
  runtime: getPublicVoiceConfig(),
}));

app.get("/openapi.json", async () => ({
  openapi: "3.1.0",
  info: {
    title: "Voice Assistant Service",
    version: "2.0.0",
    description: "Servicio de voz TankGo: pipeline STT (Gemini) → LLM con tool calling → TTS (Gemini). Accesible via HTTP y WebSocket.",
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        tags: ["Voice"],
        responses: { 200: { description: "Servicio operativo" } },
      },
    },
    "/voice/dialog": {
      post: {
        summary: "Diálogo de voz (HTTP)",
        description: "Envía texto o audio en base64 y recibe respuesta en texto y audio TTS. Para audio en streaming usar WebSocket /ws/voice.",
        tags: ["Voice"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  text: { type: "string", description: "Texto de la consulta (alternativo a audioBase64)." },
                  audioBase64: { type: "string", description: "Audio en base64 (alternativo a text)." },
                  mimeType: { type: "string", example: "audio/webm", description: "MIME type del audio." },
                  includeAudio: { type: "boolean", default: true, description: "Si devolver respuesta de voz TTS." },
                  location: {
                    type: "object",
                    description: "Ubicación del usuario para buscar gasolineras cercanas.",
                    properties: {
                      lat: { type: "number" },
                      lon: { type: "number" },
                      km: { type: "number", default: 8 },
                    },
                    required: ["lat", "lon"],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Respuesta del asistente",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    provider: { type: "string", example: "pipeline" },
                    pipeline: {
                      type: "object",
                      properties: {
                        stt: { type: "string" },
                        llm: { type: "string" },
                        tts: { type: "string" },
                      },
                    },
                    answer: {
                      type: "object",
                      properties: { text: { type: "string" } },
                    },
                    tts: {
                      type: "object",
                      properties: {
                        provider: { type: "string" },
                        note: { type: "string" },
                        audioBase64: { type: "string", nullable: true },
                        mimeType: { type: "string", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Petición inválida (falta texto o audio)" },
          429: { description: "Rate limit superado" },
          500: { description: "Error interno" },
        },
      },
    },
    "/capabilities": {
      get: {
        summary: "Capacidades del servicio",
        tags: ["Voice"],
        responses: { 200: { description: "Información de modelos y límites configurados" } },
      },
    },
  },
  tags: [{ name: "Voice", description: "Endpoints del servicio de voz TankGo" }],
}));

app.get("/capabilities", async () => ({
  service: "voice-assistant-service",
  wsPath: "/ws/voice",
  httpDialogPath: "/voice/dialog",
  actions: ["ping", "dialog", "audio_chunk", "audio_commit", "clear_buffer"],
  runtime: getPublicVoiceConfig(),
}));

app.post("/voice/dialog", async (req, reply) => {
  const authToken = parseAuthTokenFromHeaders(req.headers);
  const payload = req.body && typeof req.body === "object" ? req.body : {};

  try {
    const data = await handleDialog(payload, authToken);
    return reply.code(200).send(data);
  } catch (error) {
    const normalized = normalizeError(error, 500, "internal-error");
    return reply.code(normalized.statusCode || 500).send(normalized);
  }
});

app.get("/ws/voice", { websocket: true }, (connection, req) => {
  const socket = connection.socket;
  const origin = req.headers.origin;

  if (!isAllowedOrigin(origin)) {
    wsSend(socket, {
      type: "error",
      error: "origin-not-allowed",
      message: "Origin is not allowed for websocket connection",
    });
    socket.close(1008, "origin-not-allowed");
    return;
  }

  const connectionId = createRequestId();
  const authToken = parseAuthTokenFromHeaders(req.headers);
  const ip = extractClientIp(req.headers, req.socket);
  const watchdog = createWatchdog(socket, connectionId);
  const streamState = {
    chunks: [],
    mimeType: "audio/webm",
  };

  wsSend(socket, {
    type: "ready",
    connectionId,
    service: "voice-assistant-service",
    transport: "websocket",
    runtime: getPublicVoiceConfig(),
  });

  let queue = Promise.resolve();

  socket.on("message", (raw) => {
    watchdog.touch();

    queue = queue
      .then(async () => {
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

        const limit = rateLimiter.check(ip);
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
            data: { pong: true, ts: Date.now(), connectionId },
          });
          return;
        }

        try {
          const data = await resolveVoiceAction({
            action,
            payload,
            authToken,
            streamState,
          });

          wsSend(socket, {
            type: "response",
            id,
            action,
            ok: true,
            data,
          });
        } catch (error) {
          const normalized = normalizeError(error, 500, "internal-error");
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

  socket.on("close", () => {
    watchdog.dispose();
  });

  socket.on("error", () => {
    watchdog.dispose();
  });
});

try {
  await app.listen({ port: voiceEnv.port, host: "0.0.0.0" });
  console.log(`[voice-assistant-service] pipeline (STT→LLM→TTS) listening on :${voiceEnv.port}`);
} catch (error) {
  console.error("[voice-assistant-service] startup error", error);
  process.exit(1);
}
