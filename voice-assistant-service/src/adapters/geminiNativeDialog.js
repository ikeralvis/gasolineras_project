import { GoogleGenAI } from "@google/genai";
import { voiceEnv } from "../config/env.js";
import { getNearestStationContext } from "./gatewayTools.js";

let aiClient = null;

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout (${timeoutMs}ms)`)), timeoutMs);
    }),
  ]);
}

function getClient() {
  if (aiClient) {
    return aiClient;
  }

  if (!voiceEnv.gemini.apiKey) {
    throw new Error("GOOGLE_API_KEY or GEMINI_API_KEY is required to use Gemini API");
  }

  aiClient = new GoogleGenAI({
    apiKey: voiceEnv.gemini.apiKey,
  });

  return aiClient;
}

function extractGeminiOutput(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];

  let text = "";
  let audioBase64 = null;
  let audioMimeType = null;

  for (const part of parts) {
    if (typeof part?.text === "string" && part.text.trim()) {
      text = text ? `${text}\n${part.text.trim()}` : part.text.trim();
    }

    if (part?.inlineData?.data && String(part.inlineData.mimeType || "").startsWith("audio/")) {
      audioBase64 = part.inlineData.data;
      audioMimeType = part.inlineData.mimeType;
    }
  }

  return {
    text: text || "No he podido generar una respuesta en este turno.",
    audioBase64,
    audioMimeType,
  };
}

function buildSystemPrompt() {
  return [
    "Eres TankGo Voice Assistant.",
    "Responde en espanol de Espana de forma breve y accionable.",
    "Si no tienes contexto suficiente, dilo de forma clara.",
    "Cuando menciones precios, pronuncia decimales correctamente.",
  ].join(" ");
}

function buildUserParts({ text, audioBase64, mimeType, gasContext }) {
  const parts = [];

  if (gasContext?.promptContext) {
    parts.push({
      text: `Contexto operativo TankGo: ${gasContext.promptContext}`,
    });
  }

  if (text?.trim()) {
    parts.push({ text: text.trim() });
  }

  if (audioBase64) {
    parts.push({
      inlineData: {
        mimeType: mimeType || "audio/webm",
        data: audioBase64,
      },
    });
  }

  return parts;
}

export async function runGeminiNativeDialog({
  text = "",
  audioBase64 = "",
  mimeType = "audio/webm",
  includeAudio = true,
  location = null,
  authToken = null,
}) {
  const ai = getClient();

  const gasContext = await getNearestStationContext({
    location,
    authToken,
  });

  const userParts = buildUserParts({
    text,
    audioBase64,
    mimeType,
    gasContext,
  });

  const responseModalities = includeAudio
    ? voiceEnv.gemini.responseModalities
    : voiceEnv.gemini.responseModalities.filter((item) => item !== "AUDIO");

  const response = await withTimeout(
    ai.models.generateContent({
      model: voiceEnv.gemini.model,
      contents: [
        {
          role: "user",
          parts: userParts,
        },
      ],
      config: {
        systemInstruction: buildSystemPrompt(),
        temperature: voiceEnv.gemini.temperature,
        maxOutputTokens: voiceEnv.gemini.maxOutputTokens,
        responseModalities,
        speechConfig: {
          languageCode: voiceEnv.gemini.language,
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceEnv.gemini.voiceName,
            },
          },
        },
      },
    }),
    voiceEnv.gemini.timeoutMs,
    "gemini-native-dialog"
  );

  const output = extractGeminiOutput(response);

  return {
    provider: "google-ai-studio-gemini",
    model: voiceEnv.gemini.model,
    context: gasContext?.data || null,
    answer: {
      text: output.text,
    },
    tts: {
      audioBase64: output.audioBase64,
      mimeType: output.audioMimeType,
    },
  };
}
