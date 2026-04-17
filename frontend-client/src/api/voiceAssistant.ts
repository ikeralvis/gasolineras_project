import { apiFetchJson } from "./http";

export interface VoiceLocation {
  lat: number;
  lon: number;
  km?: number;
}

export interface VoiceAssistantResponse {
  provider?: string;
  model?: string;
  context?: {
    bootstrap?: unknown;
    toolOutputs?: unknown[];
    sttTranscript?: string;
  };
  intent?: string;
  toolResult?: unknown;
  answer?: {
    text?: string;
    provider?: string;
    model?: string;
  };
  tts?: {
    provider?: string;
    model?: string;
    note?: string;
    audioBase64?: string;
    mimeType?: string;
  };
  error?: string;
  message?: string;
}

export async function askVoiceAssistant(params: {
  text?: string;
  audioBase64?: string;
  mimeType?: string;
  location?: VoiceLocation;
  includeAudio?: boolean;
}): Promise<VoiceAssistantResponse> {
  try {
    return await apiFetchJson<VoiceAssistantResponse>("/api/voice/dialog", {
      method: "POST",
      body: JSON.stringify(params),
    });
  } catch (error) {
    return {
      error: "voice-request-failed",
      message: error instanceof Error ? error.message : "request-failed",
    };
  }
}
