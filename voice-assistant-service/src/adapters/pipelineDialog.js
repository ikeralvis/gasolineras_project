/**
 * Pipeline STT → LLM (function calling real) → TTS
 *
 * Reemplaza Gemini Live API (WebSocket bidiGenerateContent) por llamadas
 * HTTP REST estándar, eliminando el cuarto salto WebSocket inestable.
 *
 * Flujo:
 *   1. STT  – Gemini Flash transcribe el audio a texto
 *   2. LLM  – Gemini Flash responde con function calling real
 *   3. TTS  – Gemini TTS sintetiza la respuesta en voz española
 */

import { GoogleGenAI, Type } from "@google/genai";
import { voiceEnv } from "../config/env.js";
import { getNearestStationContext, getPricesForVoice, getNearestStations } from "./gatewayTools.js";

// ─── Cliente Gemini ───────────────────────────────────────────────────────────

let _aiClient = null;

function getClient() {
  if (_aiClient) return _aiClient;
  if (!voiceEnv.gemini.apiKey) {
    throw new Error("GOOGLE_API_KEY o GEMINI_API_KEY es obligatorio");
  }
  _aiClient = new GoogleGenAI({ apiKey: voiceEnv.gemini.apiKey });
  return _aiClient;
}

// ─── Modelos con fallback ─────────────────────────────────────────────────────

const DIALOG_FALLBACKS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
const TTS_FALLBACKS = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];

// ─── Declaraciones de herramientas para Gemini ────────────────────────────────

const GET_PRICES_DECLARATION = {
  name: "get_prices",
  description:
    "Devuelve precios de combustible en gasolineras cercanas ordenadas de más barata a más cara. "
    + "Úsala cuando el usuario pregunte por el precio de la gasolina, diésel, o quiera saber dónde llenar más barato.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      lat: { type: Type.NUMBER, description: "Latitud del usuario en decimal." },
      lon: { type: Type.NUMBER, description: "Longitud del usuario en decimal." },
      km: { type: Type.NUMBER, description: "Radio de búsqueda en kilómetros (por defecto 8)." },
      fuel: {
        type: Type.STRING,
        description: "Combustible a comparar: gasolina95, gasolina98, gasoleoA o gasoleoPremium. Por defecto gasolina95.",
      },
      limit: { type: Type.INTEGER, description: "Número máximo de gasolineras a devolver, entre 1 y 10." },
    },
    required: ["lat", "lon"],
  },
};

const GET_NEAREST_DECLARATION = {
  name: "get_nearest_stations",
  description:
    "Devuelve las gasolineras más cercanas ordenadas por distancia al usuario. "
    + "Úsala cuando el usuario pregunte qué gasolineras hay cerca, cuál tiene abierta, "
    + "o cualquier consulta de proximidad sin importar el precio.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      lat: { type: Type.NUMBER, description: "Latitud del usuario en decimal." },
      lon: { type: Type.NUMBER, description: "Longitud del usuario en decimal." },
      km: { type: Type.NUMBER, description: "Radio de búsqueda en kilómetros (por defecto 5)." },
      limit: { type: Type.INTEGER, description: "Número máximo de gasolineras, entre 1 y 10." },
    },
    required: ["lat", "lon"],
  },
};

const ALL_TOOLS = [GET_PRICES_DECLARATION, GET_NEAREST_DECLARATION];

// ─── Utilidades ───────────────────────────────────────────────────────────────

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    ),
  ]);
}

function buildModelCandidates(primary, fallbacks) {
  return [...new Set([primary, ...fallbacks].filter(Boolean))];
}

function isModelNotFoundError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("not found") || msg.includes("is not supported");
}

function isAudioUnsupportedError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("speechconfig") || msg.includes("responsemodalities") || msg.includes("audio config");
}

function extractText(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((p) => typeof p?.text === "string" && p.text.trim())
    .map((p) => p.text.trim())
    .join("\n")
    .trim();
}

function normalizeToolArgs(args, location) {
  const out = args && typeof args === "object" ? { ...args } : {};
  if (out.lat == null && Number.isFinite(Number(location?.lat))) out.lat = Number(location.lat);
  if (out.lon == null && Number.isFinite(Number(location?.lon))) out.lon = Number(location.lon);
  if (out.km == null && Number.isFinite(Number(location?.km))) out.km = Number(location.km);
  return out;
}

function buildSystemInstruction(gasContext) {
  const lines = [
    "Eres el Asistente de Viaje de TankGo.",
    "Responde SIEMPRE en español de España con tono natural, cercano y claro.",
    "Para consultas de precio usa get_prices. Para consultas de proximidad usa get_nearest_stations.",
    "Si no tienes la ubicación del usuario, pídela brevemente antes de llamar a ninguna función.",
    "Al citar precios di el importe en euros por litro. Respuestas de máximo 3-4 frases salvo que pidan más detalle.",
  ];
  if (gasContext?.promptContext) {
    lines.push(`Contexto actual: ${gasContext.promptContext}`);
  }
  return lines.join(" ");
}

// ─── Paso 1: STT ──────────────────────────────────────────────────────────────

async function transcribeAudio({ ai, audioBase64, mimeType }) {
  const models = buildModelCandidates(voiceEnv.gemini.dialogModel, DIALOG_FALLBACKS);
  let lastError;

  for (const model of models) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [{
            role: "user",
            parts: [
              {
                text: "Transcribe exactamente lo que se dice en este audio en español. Responde ÚNICAMENTE con el texto transcrito, sin introducción ni puntuación añadida.",
              },
              { inlineData: { mimeType: mimeType || "audio/webm", data: audioBase64 } },
            ],
          }],
          config: { temperature: 0, maxOutputTokens: 512 },
        }),
        voiceEnv.gemini.timeoutMs,
        "stt"
      );

      const transcript = extractText(response);
      if (transcript) return transcript;
      throw new Error("STT devolvió transcripción vacía");
    } catch (error) {
      lastError = error;
      if (isModelNotFoundError(error)) continue;
      throw error;
    }
  }

  throw lastError || new Error("STT falló con todos los modelos");
}

// ─── Paso 2: LLM + function calling ──────────────────────────────────────────

async function executeTool(name, args, location) {
  const normalizedArgs = normalizeToolArgs(args, location);

  if (name === "get_prices") {
    return getPricesForVoice(normalizedArgs);
  }

  if (name === "get_nearest_stations") {
    return getNearestStations(normalizedArgs);
  }

  return { error: "función no soportada", name };
}

async function runLlmForModel({ ai, model, text, location, gasContext }) {
  const systemInstruction = buildSystemInstruction(gasContext);
  const toolOutputs = [];

  let contents = [{ role: "user", parts: [{ text }] }];

  const firstResponse = await withTimeout(
    ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: ALL_TOOLS }],
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        temperature: voiceEnv.gemini.temperature,
        maxOutputTokens: voiceEnv.gemini.maxOutputTokens,
      },
    }),
    voiceEnv.gemini.timeoutMs,
    "llm-first"
  );

  const firstParts = firstResponse?.candidates?.[0]?.content?.parts || [];
  const functionCallParts = firstParts.filter((p) => p?.functionCall);

  if (!functionCallParts.length) {
    return {
      responseText: extractText(firstResponse) || "No he podido generar una respuesta en este momento.",
      toolOutputs: [],
    };
  }

  // Ejecutar herramientas en paralelo
  const functionResponseParts = await Promise.all(
    functionCallParts.map(async (part) => {
      const { name, args } = part.functionCall;
      try {
        const output = await executeTool(name, args, location);
        toolOutputs.push({ name, output });
        return { functionResponse: { name, response: { output } } };
      } catch (error) {
        return { functionResponse: { name, response: { error: String(error?.message || error) } } };
      }
    })
  );

  // Segunda llamada con resultados
  contents = [
    ...contents,
    { role: "model", parts: firstParts },
    { role: "user", parts: functionResponseParts },
  ];

  const finalResponse = await withTimeout(
    ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: voiceEnv.gemini.temperature,
        maxOutputTokens: voiceEnv.gemini.maxOutputTokens,
      },
    }),
    voiceEnv.gemini.timeoutMs,
    "llm-final"
  );

  return {
    responseText: extractText(finalResponse) || "No he podido generar una respuesta en este momento.",
    toolOutputs,
  };
}

async function runLlm({ ai, text, location, gasContext }) {
  const models = buildModelCandidates(voiceEnv.gemini.dialogModel, DIALOG_FALLBACKS);
  let lastError;

  for (const model of models) {
    try {
      return await runLlmForModel({ ai, model, text, location, gasContext });
    } catch (error) {
      lastError = error;
      if (isModelNotFoundError(error)) continue;
      throw error;
    }
  }

  throw lastError || new Error("LLM falló con todos los modelos");
}

// ─── Paso 3: TTS (Gemini) ─────────────────────────────────────────────────────

async function synthesizeGemini({ ai, text }) {
  const models = buildModelCandidates(voiceEnv.gemini.ttsModel, TTS_FALLBACKS);
  let lastError;

  for (const model of models) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [{
            role: "user",
            parts: [{
              text: `Lee este mensaje en español de España con tono natural, cercano y claro:\n\n${text}`,
            }],
          }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              languageCode: voiceEnv.gemini.language,
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceEnv.gemini.voiceName },
              },
            },
          },
        }),
        voiceEnv.gemini.timeoutMs,
        "tts"
      );

      const parts = response?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part?.inlineData?.data && String(part.inlineData.mimeType || "").startsWith("audio/")) {
          return {
            model,
            audioBase64: part.inlineData.data,
            audioMimeType: part.inlineData.mimeType,
          };
        }
      }

      throw new Error("TTS no devolvió datos de audio");
    } catch (error) {
      lastError = error;
      if (isModelNotFoundError(error) || isAudioUnsupportedError(error)) continue;
      throw error;
    }
  }

  throw lastError || new Error("TTS falló con todos los modelos");
}

async function maybeSynthesizeSpeech({ ai, text, includeAudio }) {
  if (!includeAudio) {
    return { provider: null, model: null, note: "audio-disabled", audioBase64: null, mimeType: null };
  }
  if (!String(text || "").trim()) {
    return { provider: null, model: null, note: "no-text-for-tts", audioBase64: null, mimeType: null };
  }

  try {
    const result = await synthesizeGemini({ ai, text });
    return { provider: "gemini", model: result.model, note: "ok", audioBase64: result.audioBase64, mimeType: result.audioMimeType };
  } catch (error) {
    console.warn("[voice][tts] Gemini TTS falló:", error?.message || error);
    return { provider: null, model: null, note: `tts-failed: ${String(error?.message || error)}`, audioBase64: null, mimeType: null };
  }
}

// ─── Función principal exportada ──────────────────────────────────────────────

export async function runPipelineDialog({
  text = "",
  audioBase64 = "",
  mimeType = "audio/webm",
  includeAudio = true,
  location = null,
  authToken = null,
}) {
  const ai = getClient();

  // Contexto de gasolineras (bootstrap opcional)
  const gasContext = await getNearestStationContext({ location, authToken });

  // Paso 1: STT – solo si hay audio sin texto
  let userText = String(text || "").trim();
  let sttTranscript = null;

  if (!userText && audioBase64) {
    sttTranscript = await transcribeAudio({ ai, audioBase64, mimeType });
    userText = sttTranscript;
  }

  if (!userText) {
    throw new Error("audio-or-text-required");
  }

  // Paso 2: LLM con function calling
  const { responseText, toolOutputs } = await runLlm({ ai, text: userText, location, gasContext });

  // Paso 3: TTS
  const tts = await maybeSynthesizeSpeech({ ai, text: responseText, includeAudio });

  return {
    provider: "pipeline",
    pipeline: {
      stt: sttTranscript !== null ? "gemini" : "text-input",
      llm: "gemini",
      tts: tts.provider || "none",
    },
    context: {
      bootstrap: gasContext?.data || null,
      toolOutputs,
      ...(sttTranscript !== null && { sttTranscript }),
    },
    answer: { text: responseText },
    tts,
  };
}
