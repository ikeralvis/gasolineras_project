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

import { Buffer } from "node:buffer";
import { GoogleGenAI, Type } from "@google/genai";
import { voiceEnv } from "../config/env.js";
import { getNearestStationContext, getPricesForVoice, getNearestStations, getUserProfile } from "./gatewayTools.js";
import { traceResult } from "../eval/tracer.js";

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

const LANGUAGE_CATALOG = {
  es: { code: "es-ES", label: "spanish" },
  en: { code: "en-US", label: "english" },
  eu: { code: "eu-ES", label: "basque" },
};

function detectLanguageFromText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return "es";

  const euHints = ["kaixo", "eskerrik", "mesedez", "non", "zer", "gasolindegi", "erregai", "prezio", "hurbil", "ibilbide"];
  if (euHints.some((hint) => normalized.includes(hint))) return "eu";

  // Comprobar español antes que inglés para evitar falsos positivos:
  // "gasolineras" contiene "gasoline", "mapa" contiene "map", "petroleo" contiene "petrol".
  const esHints = [
    "gasolinera", "gasolineras", "precio", "precios", "cerca", "cercana",
    "mas barata", "mas barato", "barata", "barato", "repostar", "combustible",
    "gasoleo", "gasolina", "donde", "cuanto", "cual", "que hay",
  ];
  if (esHints.some((hint) => normalized.includes(hint))) return "es";

  const enHints = [
    "hello",
    "please",
    "where",
    "which",
    "near",
    "nearest",
    "gas station",
    "station",
    "petrol",
    "gasoline",
    "diesel",
    "price",
    "cheapest",
    "route",
    "map",
  ];
  if (enHints.some((hint) => normalized.includes(hint))) return "en";

  return "es";
}

function resolveLanguage(text) {
  const key = detectLanguageFromText(text);
  return LANGUAGE_CATALOG[key] || LANGUAGE_CATALOG.es;
}

function buildSystemInstruction(gasContext, location, language) {
  let lines;

  if (language.code === "en-US") {
    lines = [
      "You are the TankGo Travel Assistant.",
      "Always respond in English with a natural, friendly tone.",
      "For price questions use get_prices. For proximity questions use get_nearest_stations.",
      "When quoting prices use euros per liter. Max 3-4 sentences unless more detail is requested.",
    ];
  } else if (language.code === "eu-ES") {
    lines = [
      "Zu TankGo bidaia laguntzailea zara.",
      "Erantzun beti euskaraz, tonu natural eta argiarekin.",
      "Prezio galderetarako erabili get_prices. Hurbiltasun galderetarako erabili get_nearest_stations.",
      "Prezioak euro/litro adierazi. 3-4 esaldi gehienez, gehiago eskatzen ez badute.",
    ];
  } else {
    lines = [
      "Eres el Asistente de Viaje de TankGo.",
      "Responde SIEMPRE en espanol con tono natural, cercano y claro.",
      "Para consultas de precio usa get_prices. Para consultas de proximidad usa get_nearest_stations.",
      "Al citar precios di el importe en euros por litro. Respuestas de maximo 3-4 frases salvo que pidan mas detalle.",
    ];
  }

  if (location?.lat != null && location?.lon != null) {
    if (language.code === "en-US") {
      lines.push(`User location: lat=${location.lat}, lon=${location.lon}. Use these coordinates when calling tools.`);
    } else if (language.code === "eu-ES") {
      lines.push(`Erabiltzailearen kokapena: lat=${location.lat}, lon=${location.lon}. Erabili koordenatu hauek tresnak deitzean.`);
    } else {
      lines.push(`Ubicacion del usuario: lat=${location.lat}, lon=${location.lon}. Usa estas coordenadas al llamar a las herramientas.`);
    }
  } else {
    if (language.code === "en-US") {
      lines.push("If you do not have the user location, ask for it briefly before calling any function.");
    } else if (language.code === "eu-ES") {
      lines.push("Kokapena ez baduzu, galdetu laburki funtziorik deitu aurretik.");
    } else {
      lines.push("Si no tienes la ubicacion del usuario, pidela brevemente antes de llamar a ninguna funcion.");
    }
  }

  if (gasContext?.promptContext) {
    if (language.code === "en-US") {
      lines.push(`Current context: ${gasContext.promptContext}`);
    } else if (language.code === "eu-ES") {
      lines.push(`Uneko testuingurua: ${gasContext.promptContext}`);
    } else {
      lines.push(`Contexto actual: ${gasContext.promptContext}`);
    }
  }
  return lines.join(" ");
}

function isInScope(text) {
  const normalized = normalizeText(text);
  if (!normalized) return true;

  const smallTalk = ["hola", "buenas", "gracias", "adios", "ok", "vale", "hey", "hello", "thanks", "bye", "kaixo", "eskerrik", "agur"];
  if (smallTalk.some((hint) => normalized.includes(hint))) return true;

  const scopeKeywords = [
    "gasolinera",
    "gasolineras",
    "gas station",
    "gasolindegi",
    "gasolina",
    "gasoline",
    "petrol",
    "diesel",
    "gasoleo",
    "erregai",
    "combustible",
    "repostar",
    "precio",
    "precios",
    "price",
    "cheapest",
    "barata",
    "barato",
    "cerca",
    "near",
    "nearest",
    "hurbil",
    "rutas",
    "route",
    "ibilbide",
    "recarga",
    "charging",
    "mapa",
    "map",
    "tankgo",
  ];

  return scopeKeywords.some((keyword) => normalized.includes(keyword));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasLocation(location) {
  return Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lon));
}

function detectFuelFromText(text) {
  const normalized = normalizeText(text);

  if (normalized.includes("98")) return "gasolina98";
  if (normalized.includes("95") || normalized.includes("sin plomo")) return "gasolina95";
  if (normalized.includes("premium") && normalized.includes("gasoleo")) return "gasoleoPremium";
  if (normalized.includes("diesel") || normalized.includes("gasoleo")) return "gasoleoA";

  return null;
}

function extractKmFromText(text) {
  const match = /(\d+(?:[\.,]\d+)?)\s*(?:km|kilometros|kilometro)/i.exec(text || "");
  if (!match) return null;
  const raw = String(match[1]).replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampKm(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const minKm = 1;
  const maxKm = voiceEnv.gateway.maxKm;
  return Math.min(Math.max(parsed, minKm), maxKm);
}

function mapPreferredFuelToKey(value) {
  const normalized = normalizeText(value);
  if (normalized.includes("gasolina 98")) return "gasolina98";
  if (normalized.includes("gasolina 95")) return "gasolina95";
  if (normalized.includes("gasoleo premium")) return "gasoleoPremium";
  if (normalized.includes("gasoleo a")) return "gasoleoA";
  if (normalized.includes("gasoleo b")) return "gasoleoA";
  return null;
}

function extractBrand(text) {
  const normalized = normalizeText(text);
  const knownBrands = ["repsol", "cepsa", "bp", "shell", "galp", "carrefour", "alcampo", "eroski", "avia"];

  const hit = knownBrands.find((brand) => normalized.includes(brand));
  if (hit) return hit;

  const match = /marca\s+([a-z0-9-]{2,})/i.exec(text || "");
  return match ? match[1].toLowerCase() : null;
}

function formatBrand(brand) {
  if (!brand) return "";
  if (brand.length <= 3) return brand.toUpperCase();
  return `${brand.charAt(0).toUpperCase()}${brand.slice(1)}`;
}

function classifyIntent(text) {
  const normalized = normalizeText(text);
  const wantsNearest = /(mas cercana|mas cerca|cerca|proxima|cercana|nearest|near|closest|hurbil)/.test(normalized);
  const wantsCheapest = /(mas barata|mas barato|barata|barato|precio|cuesta|economica|economico|cheapest|price|cost|merkeena)/.test(normalized);
  const wantsBrand = /(marca|repsol|cepsa|bp|shell|galp|carrefour|alcampo|eroski|avia)/.test(normalized);

  if (wantsCheapest) return { type: "prices", wantsBrand };
  if (wantsNearest) return { type: "nearest", wantsBrand };
  if (wantsBrand) return { type: "nearest", wantsBrand };
  return { type: "unknown", wantsBrand: false };
}

function filterStationsByBrand(stations, brand) {
  if (!brand) return stations;
  const normalizedBrand = normalizeText(brand);
  return stations.filter((station) => normalizeText(station?.name).includes(normalizedBrand));
}

function formatStationAddress(station) {
  const parts = [station.address, station.municipality, station.province].filter(Boolean);
  return parts.join(", ").trim();
}

function formatDistance(distanceKm) {
  if (!Number.isFinite(Number(distanceKm))) return "";
  return `A unos ${Number(distanceKm).toFixed(1)} km.`;
}

function fuelLabel(fuelKey, languageCode) {
  switch (fuelKey) {
    case "gasolina98":
      return languageCode === "en-US" ? "gasoline 98" : "gasolina 98";
    case "gasoleoA":
      return languageCode === "en-US" ? "diesel" : "gasoleo A";
    case "gasoleoPremium":
      return languageCode === "en-US" ? "premium diesel" : "gasoleo premium";
    default:
      return languageCode === "en-US" ? "gasoline 95" : "gasolina 95";
  }
}

function buildCheapestAnswer({ station, fuelKey, km, brand, language }) {
  if (!station) {
    const brandLabel = formatBrand(brand);
    if (language.code === "en-US") {
      return `I cannot find a${brandLabel ? ` ${brandLabel}` : ""} gas station within ${km} km with price available. Should I expand the radius?`;
    }
    if (language.code === "eu-ES") {
      return `Ez dut aurkitu${brandLabel ? ` ${brandLabel}` : ""} gasolindegirik ${km} km barruan prezioarekin. Zabaldu eremua?`;
    }
    return `No encuentro una gasolinera${brandLabel ? ` de ${brandLabel}` : ""} a menos de ${km} km con precio disponible. Amplio el radio?`;
  }

  const price = station?.prices?.[fuelKey];
  let priceText;
  if (language.code === "en-US") {
    priceText = price ? `at ${price.toFixed(3)} EUR/L` : "no price available";
  } else if (language.code === "eu-ES") {
    priceText = price ? `${price.toFixed(3)} EUR/L` : "preziorik gabe";
  } else {
    priceText = price ? `a ${price.toFixed(3)} EUR/l` : "sin precio disponible";
  }
  const address = formatStationAddress(station);
  const distance = formatDistance(station.distanceKm);
  const brandLabel = formatBrand(brand);

  if (language.code === "en-US") {
    return `The cheapest${brandLabel ? ` ${brandLabel}` : ""} option for ${fuelLabel(fuelKey, language.code)} is ${station.name || "that station"} at ${address}, ${priceText}. About ${Number(station.distanceKm || 0).toFixed(1)} km away.`.trim();
  }
  if (language.code === "eu-ES") {
    return `Merkeena${brandLabel ? ` ${brandLabel}` : ""} ${fuelLabel(fuelKey, language.code)}rako ${station.name || "gasolindegi hori"} da, ${address}, ${priceText}. Gutxi gorabehera ${Number(station.distanceKm || 0).toFixed(1)} km.`.trim();
  }

  return `La mas barata${brandLabel ? ` de ${brandLabel}` : ""} para ${fuelLabel(fuelKey, language.code)} es ${station.name || "esa gasolinera"} en ${address}, ${priceText}. ${distance}`.trim();
}

function buildNearestAnswer({ station, km, brand, language }) {
  if (!station) {
    const brandLabel = formatBrand(brand);
    if (language.code === "en-US") {
      return `I cannot find a${brandLabel ? ` ${brandLabel}` : ""} gas station within ${km} km. Should I expand the radius?`;
    }
    if (language.code === "eu-ES") {
      return `Ez dut aurkitu${brandLabel ? ` ${brandLabel}` : ""} gasolindegirik ${km} km barruan. Zabaldu eremua?`;
    }
    return `No encuentro una gasolinera${brandLabel ? ` de ${brandLabel}` : ""} a menos de ${km} km. Quieres ampliar el radio?`;
  }

  const address = formatStationAddress(station);
  const distance = formatDistance(station.distanceKm);
  const brandLabel = formatBrand(brand);

  if (language.code === "en-US") {
    return `The nearest${brandLabel ? ` ${brandLabel}` : ""} station is ${station.name || "that station"} at ${address}. About ${Number(station.distanceKm || 0).toFixed(1)} km away.`.trim();
  }
  if (language.code === "eu-ES") {
    return `Hurbilen dagoen${brandLabel ? ` ${brandLabel}` : ""}a ${station.name || "gasolindegi hori"} da, ${address}. Gutxi gorabehera ${Number(station.distanceKm || 0).toFixed(1)} km.`.trim();
  }
  return `La mas cercana${brandLabel ? ` de ${brandLabel}` : ""} es ${station.name || "esa gasolinera"} en ${address}. ${distance}`.trim();
}

function pcmToWavBase64(pcmBase64, mimeType) {
  const sampleRate = Number(/rate=(\d+)/i.exec(mimeType || "")?.[1] || 24000);
  const channels = Number(/channels=(\d+)/i.exec(mimeType || "")?.[1] || 1);
  const bitsPerSample = 16;
  const pcmData = Buffer.from(pcmBase64, "base64");
  const dataSize = pcmData.length;
  const buf = Buffer.allocUnsafe(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buf.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  pcmData.copy(buf, 44);
  return buf.toString("base64");
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
                text: "Transcribe exactly what is said in this audio and keep the original language. Reply ONLY with the transcript, no extra text.",
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

async function runLlmForModel({ ai, model, text, location, gasContext, language }) {
  const systemInstruction = buildSystemInstruction(gasContext, location, language);
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

async function runLlm({ ai, text, location, gasContext, language }) {
  const models = buildModelCandidates(voiceEnv.gemini.dialogModel, DIALOG_FALLBACKS);
  let lastError;

  for (const model of models) {
    try {
      return await runLlmForModel({ ai, model, text, location, gasContext, language });
    } catch (error) {
      lastError = error;
      if (isModelNotFoundError(error)) continue;
      throw error;
    }
  }

  throw lastError || new Error("LLM falló con todos los modelos");
}

// ─── Paso 3: TTS (Gemini) ─────────────────────────────────────────────────────

function buildTtsPrompt(text, languageCode) {
  if (languageCode === "en-US") {
    return `Read this message in English with a natural, friendly and clear tone:\n\n${text}`;
  }
  if (languageCode === "eu-ES") {
    return `Irakurri mezu hau euskaraz tonu natural, hurbil eta argiarekin:\n\n${text}`;
  }
  return `Lee este mensaje en español de España con tono natural, cercano y claro:\n\n${text}`;
}

async function synthesizeGemini({ ai, text, languageCode }) {
  const models = buildModelCandidates(voiceEnv.gemini.ttsModel, TTS_FALLBACKS);
  const resolvedLang = languageCode || voiceEnv.gemini.language;
  let lastError;

  for (const model of models) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [{
            role: "user",
            parts: [{
              text: buildTtsPrompt(text, resolvedLang),
            }],
          }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              languageCode: resolvedLang,
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
          const rawBase64 = part.inlineData.data;
          const rawMime = part.inlineData.mimeType;
          const wavBase64 = pcmToWavBase64(rawBase64, rawMime);
          return { model, audioBase64: wavBase64, audioMimeType: "audio/wav" };
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

async function maybeSynthesizeSpeech({ ai, text, includeAudio, languageCode }) {
  if (!includeAudio) {
    return { provider: null, model: null, note: "audio-disabled", audioBase64: null, mimeType: null };
  }
  if (!String(text || "").trim()) {
    return { provider: null, model: null, note: "no-text-for-tts", audioBase64: null, mimeType: null };
  }

  try {
    const result = await synthesizeGemini({ ai, text, languageCode });
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
  const _t0 = Date.now();
  const ai = getClient();
  const userTextRaw = String(text || "").trim();
  const needsStt = Boolean(!userTextRaw && audioBase64);

  // Paso 1: gasContext y STT en paralelo
  const [gasContext, sttResult] = await Promise.all([
    getNearestStationContext({ location, authToken }),
    needsStt ? transcribeAudio({ ai, audioBase64, mimeType }) : Promise.resolve(null),
  ]);

  const sttTranscript = sttResult;
  const userText = userTextRaw || sttTranscript || "";

  if (!userText) {
    throw new Error("audio-or-text-required");
  }

  const language = resolveLanguage(userText);
  const intent = classifyIntent(userText);
  const locationKnown = hasLocation(location);
  const toolOutputs = [];
  let responseText = "";

  if (intent.type !== "unknown") {
    if (!locationKnown || !location) {
      responseText = "Necesito tu ubicacion para buscar gasolineras cercanas. ¿Puedes compartirla?";
    } else {
      const userProfile = await getUserProfile({ authToken });
      const fuelFromText = detectFuelFromText(userText);
      const fuelFromProfile = mapPreferredFuelToKey(userProfile?.combustible_favorito);
      const fuelKey = fuelFromText || fuelFromProfile || "gasolina95";
      const brand = extractBrand(userText);
      const kmFromText = extractKmFromText(userText);

      if (intent.type === "prices") {
        const km = clampKm(kmFromText ?? location?.km ?? 8, 8);
        const limit = brand ? 10 : 5;
        const pricesResult = await getPricesForVoice({
          lat: location.lat,
          lon: location.lon,
          km,
          limit,
          fuel: fuelKey,
        });
        toolOutputs.push({ name: "get_prices", output: pricesResult });

        if (!pricesResult?.ok) {
          responseText = pricesResult?.message || "No pude consultar precios ahora mismo.";
        } else {
          const filtered = filterStationsByBrand(pricesResult.stations || [], brand);
          const station = filtered[0] || null;
          responseText = buildCheapestAnswer({ station, fuelKey, km, brand, language });
        }
      } else if (intent.type === "nearest") {
        const km = clampKm(kmFromText ?? location?.km ?? 5, 5);
        const limit = brand ? 10 : 5;
        const nearestResult = await getNearestStations({
          lat: location.lat,
          lon: location.lon,
          km,
          limit,
        });
        toolOutputs.push({ name: "get_nearest_stations", output: nearestResult });

        if (!nearestResult?.ok) {
          responseText = nearestResult?.message || "No pude consultar gasolineras cercanas ahora mismo.";
        } else {
          const filtered = filterStationsByBrand(nearestResult.stations || [], brand);
          const station = filtered[0] || null;
          responseText = buildNearestAnswer({ station, km, brand, language });
        }
      }
    }
  }

  let guardrailFired = false;
  if (!responseText) {
    if (voiceEnv.guardrails.enabled && !isInScope(userText)) {
      guardrailFired = true;
      if (language.code === "en-US") {
        responseText = voiceEnv.guardrails.mode === "strict"
          ? "Sorry, I can only help with TankGo questions about gas stations, prices, and routes."
          : "I can help with fuel prices, nearby stations, and routes in TankGo. Tell me your gas station question.";
      } else if (language.code === "eu-ES") {
        responseText = voiceEnv.guardrails.mode === "strict"
          ? "Barkatu, TankGo-ren gasolindegi, prezio eta ibilbide galderak bakarrik erantzun ditzaket."
          : "TankGo-n erregai prezioekin, gasolindegi hurbilekin eta ibilbideekin lagun dezaket. Esan gasolindegiei buruzko galdera.";
      } else {
        responseText = voiceEnv.guardrails.mode === "strict"
          ? "Lo siento, solo puedo ayudar con consultas de TankGo sobre gasolineras, precios y rutas."
          : "Puedo ayudarte con precios de combustible, gasolineras cercanas y rutas en TankGo. Si quieres, dime tu consulta sobre gasolineras o precios.";
      }
    } else {
      const llmResult = await runLlm({ ai, text: userText, location, gasContext, language });
      responseText = llmResult.responseText;
      toolOutputs.push(...llmResult.toolOutputs);
    }
  }

  // Paso 3: TTS
  const tts = await maybeSynthesizeSpeech({ ai, text: responseText, includeAudio, languageCode: language.code });

  const result = {
    provider: "pipeline",
    pipeline: {
      stt: sttTranscript !== null ? "gemini" : "text-input",
      llm: "gemini",
      tts: tts.provider || "none",
    },
    context: {
      bootstrap: gasContext?.data || null,
      intent: intent.type,
      language: language.code,
      toolOutputs,
      guardrailsTriggered: guardrailFired,
      ...(sttTranscript !== null && { sttTranscript }),
    },
    answer: { text: responseText },
    tts,
  };

  traceResult({ text: userText, audioBase64, location }, result, Date.now() - _t0).catch(() => {});
  return result;
}

export { classifyIntent, isInScope, detectLanguageFromText, extractBrand };
