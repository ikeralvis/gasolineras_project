const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export interface VoiceLocation {
  lat: number;
  lon: number;
  km?: number;
}

export interface VoiceAssistantResponse {
  intent: string;
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
    format?: string;
    text?: string;
  };
  error?: string;
  message?: string;
}

export interface VoiceTranscriptionResponse {
  text?: string;
  provider?: string;
  model?: string;
  error?: string;
  message?: string;
}

export async function askVoiceAssistant(params: {
  text: string;
  location?: VoiceLocation;
  includeAudio?: boolean;
}): Promise<VoiceAssistantResponse> {
  const res = await fetch(`${API_BASE_URL}/api/voice/intent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const data = (await res.json().catch(() => ({}))) as VoiceAssistantResponse;
  if (!res.ok) {
    return {
      error: data?.error || "voice-request-failed",
      message: data?.message,
      ...data,
    };
  }

  return data;
}

export async function transcribeVoiceChunk(params: {
  audioBase64: string;
  mimeType?: string;
  language?: string;
  prompt?: string;
}): Promise<VoiceTranscriptionResponse> {
  const res = await fetch(`${API_BASE_URL}/api/voice/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const data = (await res.json().catch(() => ({}))) as VoiceTranscriptionResponse;
  if (!res.ok) {
    return {
      error: data?.error || "voice-transcription-failed",
      message: data?.message,
      ...data,
    };
  }

  return data;
}
