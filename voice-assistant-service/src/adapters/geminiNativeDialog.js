import { GoogleGenAI, Modality, Type } from "@google/genai";
import { voiceEnv } from "../config/env.js";
import { getNearestStationContext, getPricesForVoice } from "./gatewayTools.js";

let aiClient = null;

const FALLBACK_LIVE_MODELS = [
  "models/gemini-2.5-flash-native-audio-latest",
  "gemini-2.5-flash-native-audio-latest",
  "models/gemini-3.1-flash-live-preview",
  "gemini-3.1-flash-live-preview",
];

const FALLBACK_DIALOG_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
const FALLBACK_TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];

const GET_PRICES_FUNCTION_DECLARATION = {
  name: "get_prices",
  description:
    "Devuelve precios de combustible en gasolineras cercanas para una ubicacion. "
    + "Usa esta funcion cuando el usuario pregunte por precios o estaciones cercanas.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      lat: { type: Type.NUMBER, description: "Latitud del usuario en decimal." },
      lon: { type: Type.NUMBER, description: "Longitud del usuario en decimal." },
      km: { type: Type.NUMBER, description: "Radio de busqueda en kilometros." },
      fuel: {
        type: Type.STRING,
        description: "Combustible de referencia: gasolina95, gasolina98, gasoleoA o gasoleoPremium.",
      },
      limit: { type: Type.INTEGER, description: "Numero maximo de estaciones entre 1 y 10." },
    },
    required: ["lat", "lon"],
  },
};

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

function extractParts(response) {
  return response?.candidates?.[0]?.content?.parts || [];
}

function extractGeminiOutput(response) {
  const parts = extractParts(response);
  let text = "";

  for (const part of parts) {
    if (typeof part?.text === "string" && part.text.trim()) {
      text = text ? `${text}\n${part.text.trim()}` : part.text.trim();
    }
  }

  return {
    text: text || "No he podido generar una respuesta en este turno.",
  };
}

function extractAudioOutput(response) {
  const parts = extractParts(response);
  for (const part of parts) {
    if (part?.inlineData?.data && String(part.inlineData.mimeType || "").startsWith("audio/")) {
      return {
        audioBase64: part.inlineData.data,
        audioMimeType: part.inlineData.mimeType,
      };
    }
  }

  return {
    audioBase64: null,
    audioMimeType: null,
  };
}

function buildSystemPrompt() {
  return [
    "Eres el Asistente de Viaje de TankGo.",
    "Responde siempre en espanol de Espana con tono natural, cercano y claro.",
    "Cuando pregunten por precios o estaciones cercanas, usa la funcion get_prices.",
    "Si no tienes ubicacion suficiente, pidela de forma breve.",
    "Cuando menciones precios, indica EUR por litro y pronuncia bien los decimales.",
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

function buildModelCandidates(primaryModel, fallbackModels) {
  const ordered = [primaryModel, ...fallbackModels].filter(Boolean);
  return [...new Set(ordered)];
}

function appendAudioBuffer(buffers, base64Chunk) {
  if (!base64Chunk) {
    return;
  }

  try {
    buffers.push(Buffer.from(base64Chunk, "base64"));
  } catch {
    // Ignore malformed chunks.
  }
}

function extractErrorMessage(error) {
  if (!error) {
    return "unknown-gemini-error";
  }

  if (typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  return String(error);
}

function isModelNotFoundError(error) {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes("not found")
    || message.includes("status\":\"not_found\"")
    || message.includes("is not supported")
  );
}

function isAudioConfigUnsupportedError(error) {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes("speechconfig")
    || message.includes("responsemodalities")
    || message.includes("audio")
  );
}

function isLiveModelUnsupportedError(error) {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes("bidigeneratecontent")
    || message.includes("live")
    || message.includes("websocket")
  );
}

function buildLiveResponseModalities(includeAudio) {
  return includeAudio ? [Modality.AUDIO, Modality.TEXT] : [Modality.TEXT];
}

function buildLiveResult({
  model,
  includeAudio,
  textChunks,
  audioBuffers,
  audioMimeType,
  toolOutputs,
  gasContext,
}) {
  const answerText = textChunks.join("\n").trim() || "No he podido generar una respuesta en este turno.";
  const audioBase64 = audioBuffers.length ? Buffer.concat(audioBuffers).toString("base64") : null;
  let ttsNote = "audio-disabled";
  if (includeAudio) {
    ttsNote = audioBase64 ? "ok" : "live-no-audio";
  }

  return {
    provider: "google-ai-studio-gemini-live",
    model,
    context: {
      bootstrap: gasContext?.data || null,
      toolOutputs,
    },
    answer: {
      text: answerText,
    },
    tts: {
      provider: "google-ai-studio-gemini-live",
      model,
      note: ttsNote,
      audioBase64: includeAudio ? audioBase64 : null,
      mimeType: includeAudio ? audioMimeType : null,
    },
  };
}

function normalizeToolArgs(args, location) {
  const normalized = args && typeof args === "object" ? { ...args } : {};

  if (normalized.lat == null && Number.isFinite(Number(location?.lat))) {
    normalized.lat = Number(location.lat);
  }
  if (normalized.lon == null && Number.isFinite(Number(location?.lon))) {
    normalized.lon = Number(location.lon);
  }
  if (normalized.km == null && Number.isFinite(Number(location?.km))) {
    normalized.km = Number(location.km);
  }

  return normalized;
}

async function executeToolCalls({ functionCalls, session, location }) {
  const outputs = [];

  const functionResponses = await Promise.all(
    functionCalls.map(async (call) => {
      const name = call?.name || "unknown";
      const id = call?.id;

      if (name !== "get_prices") {
        return {
          id,
          name,
          response: {
            error: {
              code: "unsupported-function",
              message: `Function ${name} is not supported by TankGo voice backend.`,
            },
          },
        };
      }

      try {
        const output = await getPricesForVoice(normalizeToolArgs(call?.args, location));
        outputs.push({ name, output });
        return {
          id,
          name,
          response: { output },
        };
      } catch (error) {
        return {
          id,
          name,
          response: {
            error: {
              code: "tool-execution-failed",
              message: extractErrorMessage(error),
            },
          },
        };
      }
    })
  );

  session.sendToolResponse({ functionResponses });
  return outputs;
}

async function processLiveToolCalls({
  calls,
  session,
  location,
  toolOutputs,
  onError,
  onDone,
}) {
  try {
    const outputs = await executeToolCalls({ functionCalls: calls, session, location });
    toolOutputs.push(...outputs);
  } catch (error) {
    onError(new Error(`live-tool-call-error: ${extractErrorMessage(error)}`));
  } finally {
    onDone();
  }
}

async function generateContent({ ai, model, contents, config, label }) {
  return withTimeout(
    ai.models.generateContent({
      model,
      contents,
      config,
    }),
    voiceEnv.gemini.timeoutMs,
    label
  );
}

async function generateDialogWithFallbacks({ ai, userParts }) {
  const modelCandidates = buildModelCandidates(voiceEnv.gemini.dialogModel, FALLBACK_DIALOG_MODELS);
  let lastError = null;

  for (const model of modelCandidates) {
    try {
      const response = await generateContent({
        ai,
        model,
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
          responseModalities: ["TEXT"],
        },
        label: "gemini-dialog",
      });

      return { response, model };
    } catch (error) {
      lastError = error;
      if (isModelNotFoundError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("No Gemini dialog model candidate succeeded");
}

async function synthesizeSpeechWithFallbacks({ ai, text }) {
  const modelCandidates = buildModelCandidates(voiceEnv.gemini.ttsModel, FALLBACK_TTS_MODELS);
  let lastError = null;

  for (const model of modelCandidates) {
    try {
      const response = await generateContent({
        ai,
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Lee este mensaje en espanol de Espana con un tono claro, natural y cercano:\n\n${text}`,
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            languageCode: voiceEnv.gemini.language,
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceEnv.gemini.voiceName,
              },
            },
          },
        },
        label: "gemini-tts",
      });

      const ttsOutput = extractAudioOutput(response);
      if (!ttsOutput.audioBase64) {
        throw new Error("Gemini TTS did not return audio data");
      }

      return {
        model,
        ...ttsOutput,
      };
    } catch (error) {
      lastError = error;

      if (isModelNotFoundError(error) || isAudioConfigUnsupportedError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("No Gemini TTS model candidate succeeded");
}

async function runLiveDialogForModel({
  ai,
  model,
  text,
  audioBase64,
  mimeType,
  includeAudio,
  location,
  gasContext,
}) {
  const textChunks = [];
  const audioBuffers = [];
  let audioMimeType = null;
  const toolOutputs = [];
  const timeoutMs = Math.max(voiceEnv.gemini.timeoutMs, 20000);

  return withTimeout(
    new Promise((resolve, reject) => {
      let session = null;
      let closed = false;
      let turnComplete = false;
      let pendingToolCalls = 0;

      const finishWithError = (error) => {
        if (closed) {
          return;
        }
        closed = true;
        try {
          session?.close();
        } catch {
          // Ignore close errors.
        }
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const finishWithSuccess = () => {
        if (closed) {
          return;
        }
        closed = true;
        try {
          session?.close();
        } catch {
          // Ignore close errors.
        }

        resolve(
          buildLiveResult({
            model,
            includeAudio,
            textChunks,
            audioBuffers,
            audioMimeType,
            toolOutputs,
            gasContext,
          })
        );
      };

      const maybeFinish = () => {
        if (turnComplete && pendingToolCalls === 0) {
          finishWithSuccess();
        }
      };

      const markToolCallDone = () => {
        pendingToolCalls = Math.max(pendingToolCalls - 1, 0);
        maybeFinish();
      };

      const startSession = async () => {
        session = await ai.live.connect({
          model,
          config: {
            responseModalities: buildLiveResponseModalities(includeAudio),
            temperature: voiceEnv.gemini.temperature,
            maxOutputTokens: voiceEnv.gemini.maxOutputTokens,
            speechConfig: includeAudio
              ? {
                  languageCode: voiceEnv.gemini.language,
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: voiceEnv.gemini.voiceName,
                    },
                  },
                }
              : undefined,
            systemInstruction: buildSystemPrompt(),
            tools: [{ functionDeclarations: [GET_PRICES_FUNCTION_DECLARATION] }],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
          callbacks: {
            onmessage: (message) => {
              try {
                const calls = message?.toolCall?.functionCalls || [];
                if (calls.length) {
                  pendingToolCalls += 1;
                  void processLiveToolCalls({
                    calls,
                    session,
                    location,
                    toolOutputs,
                    onError: finishWithError,
                    onDone: markToolCallDone,
                  });
                }

                const parts = message?.serverContent?.modelTurn?.parts || [];
                for (const part of parts) {
                  if (typeof part?.text === "string" && part.text.trim()) {
                    textChunks.push(part.text.trim());
                  }

                  if (part?.inlineData?.data && String(part.inlineData.mimeType || "").startsWith("audio/")) {
                    if (!audioMimeType) {
                      audioMimeType = part.inlineData.mimeType;
                    }
                    appendAudioBuffer(audioBuffers, part.inlineData.data);
                  }
                }

                const outputTranscript = message?.serverContent?.outputTranscription?.text;
                if (typeof outputTranscript === "string" && outputTranscript.trim() && textChunks.length === 0) {
                  textChunks.push(outputTranscript.trim());
                }

                if (message?.serverContent?.turnComplete || message?.serverContent?.generationComplete) {
                  turnComplete = true;
                  maybeFinish();
                }
              } catch (error) {
                finishWithError(new Error(`live-message-handler-error: ${extractErrorMessage(error)}`));
              }
            },
            onerror: (event) => {
              finishWithError(new Error(`live-session-error: ${extractErrorMessage(event?.error || event)}`));
            },
            onclose: (event) => {
              if (closed || turnComplete) {
                return;
              }
              finishWithError(new Error(`live-session-closed: ${event?.code || "unknown"}`));
            },
          },
        });

        const trimmedText = String(text || "").trim();
        if (trimmedText) {
          session.sendClientContent({
            turns: [
              {
                role: "user",
                parts: [{ text: trimmedText }],
              },
            ],
            turnComplete: !audioBase64,
          });
        }

        if (audioBase64) {
          session.sendRealtimeInput({
            audio: {
              mimeType: mimeType || "audio/webm",
              data: audioBase64,
            },
          });

          session.sendRealtimeInput({
            audioStreamEnd: true,
          });
        }

        if (!trimmedText && !audioBase64) {
          finishWithError(new Error("audio-or-text-required"));
        }
      };

      startSession().catch((error) => {
        finishWithError(error);
      });
    }),
    timeoutMs,
    "gemini-live-dialog"
  );
}

async function runLiveDialogWithFallbacks(params) {
  const modelCandidates = buildModelCandidates(voiceEnv.gemini.liveModel, FALLBACK_LIVE_MODELS);
  let lastError = null;

  for (const model of modelCandidates) {
    try {
      return await runLiveDialogForModel({
        ...params,
        model,
      });
    } catch (error) {
      lastError = error;
      if (isModelNotFoundError(error) || isLiveModelUnsupportedError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("No Gemini live model candidate succeeded");
}

async function runTwoStepDialog({ ai, text, audioBase64, mimeType, includeAudio, gasContext }) {
  const userParts = buildUserParts({
    text,
    audioBase64,
    mimeType,
    gasContext,
  });

  const generatedDialog = await generateDialogWithFallbacks({
    ai,
    userParts,
  });

  const output = extractGeminiOutput(generatedDialog.response);

  let tts = {
    provider: "google-ai-studio-gemini",
    model: null,
    note: "audio-disabled",
    audioBase64: null,
    mimeType: null,
  };

  if (includeAudio && output.text?.trim()) {
    try {
      const generatedTts = await synthesizeSpeechWithFallbacks({
        ai,
        text: output.text,
      });

      tts = {
        provider: "google-ai-studio-gemini",
        model: generatedTts.model,
        note: "ok",
        audioBase64: generatedTts.audioBase64,
        mimeType: generatedTts.audioMimeType,
      };
    } catch (error) {
      tts = {
        provider: "google-ai-studio-gemini",
        model: null,
        note: `tts-fallback-failed: ${extractErrorMessage(error)}`,
        audioBase64: null,
        mimeType: null,
      };
    }
  }

  return {
    provider: "google-ai-studio-gemini",
    model: generatedDialog.model,
    context: gasContext?.data || null,
    answer: {
      text: output.text,
    },
    tts,
  };
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

  if (voiceEnv.gemini.useLiveApi) {
    try {
      const liveResult = await runLiveDialogWithFallbacks({
        ai,
        text,
        audioBase64,
        mimeType,
        includeAudio,
        location,
        gasContext,
      });

      if (includeAudio && !liveResult?.tts?.audioBase64 && liveResult?.answer?.text) {
        const generatedTts = await synthesizeSpeechWithFallbacks({
          ai,
          text: liveResult.answer.text,
        }).catch(() => null);

        if (generatedTts) {
          liveResult.tts = {
            provider: "google-ai-studio-gemini",
            model: generatedTts.model,
            note: "ok-fallback-tts",
            audioBase64: generatedTts.audioBase64,
            mimeType: generatedTts.audioMimeType,
          };
        }
      }

      return liveResult;
    } catch (error) {
      console.warn(`[voice] live-dialog failed, switching to two-step pipeline: ${extractErrorMessage(error)}`);
    }
  }

  return runTwoStepDialog({
    ai,
    text,
    audioBase64,
    mimeType,
    includeAudio,
    gasContext,
  });
}
