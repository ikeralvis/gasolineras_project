import { apiFetchJson } from "./http";

const DEFAULT_LOCAL_VOICE_WS_URL = "ws://localhost:8090/ws/voice";
const VOICE_HTTP_DIALOG_PATH = "/api/voice/dialog";

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function toWsUrlFromHttpBase(rawHttpBase: string): string | null {
  if (!rawHttpBase) {
    return null;
  }

  try {
    const parsed = new URL(rawHttpBase);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return null;
    }

    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    parsed.pathname = "/ws/voice";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeVoiceWsUrl(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  if (/^wss?:\/\//i.test(value)) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    return toWsUrlFromHttpBase(value);
  }

  if (value.startsWith("/") && globalThis.window !== undefined) {
    const protocol = globalThis.window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${globalThis.window.location.host}${value}`;
  }

  return null;
}

function buildVoiceWsUrl(): string {
  const fromExplicitWsEnv = normalizeVoiceWsUrl(import.meta.env.VITE_VOICE_WS_URL ?? "");
  if (fromExplicitWsEnv) {
    return fromExplicitWsEnv;
  }

  const fromVoiceServiceEnv = toWsUrlFromHttpBase((import.meta.env.VITE_VOICE_SERVICE_URL ?? "").trim());
  if (fromVoiceServiceEnv) {
    return fromVoiceServiceEnv;
  }

  if (globalThis.window !== undefined) {
    const protocol = globalThis.window.location.protocol === "https:" ? "wss:" : "ws:";
    if (isLocalHostname(globalThis.window.location.hostname)) {
      return DEFAULT_LOCAL_VOICE_WS_URL;
    }
    return `${protocol}//${globalThis.window.location.host}/ws/voice`;
  }

  return DEFAULT_LOCAL_VOICE_WS_URL;
}

const VOICE_WS_URL = buildVoiceWsUrl();
const VOICE_WS_KEEPALIVE_MS = 25000;

type WsPending = {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

let ws: WebSocket | null = null;
let openPromise: Promise<WebSocket> | null = null;
const pending = new Map<string, WsPending>();
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let wsTransportDisabled = false;

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function rejectAllPending(reason: Error) {
  for (const [requestId, item] of pending) {
    clearTimeout(item.timer);
    item.reject(reason);
    pending.delete(requestId);
  }
}

function stopKeepalive() {
  if (keepaliveTimer != null) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

function startKeepalive(socket: WebSocket) {
  stopKeepalive();

  keepaliveTimer = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      stopKeepalive();
      return;
    }

    socket.send(
      JSON.stringify({
        id: `ping-${Date.now()}`,
        action: "ping",
        payload: {},
      })
    );
  }, VOICE_WS_KEEPALIVE_MS);
}

function attachSocketHandlers(socket: WebSocket) {
  socket.onmessage = (event) => {
    let message: any;
    try {
      message = JSON.parse(String(event.data || ""));
    } catch (error) {
      console.warn("[voice] invalid websocket message", error);
      return;
    }

    if (message?.type !== "response") {
      return;
    }

    const requestId = message?.id;
    if (!requestId || !pending.has(requestId)) {
      return;
    }

    const current = pending.get(requestId);
    if (!current) {
      return;
    }

    clearTimeout(current.timer);
    pending.delete(requestId);

    if (message.ok) {
      current.resolve(message.data ?? {});
      return;
    }

    const errorPayload: Record<string, unknown> = {
      error: message.error || "voice-request-failed",
      message: message.message,
    };
    if (message.maxChars !== undefined && message.maxChars !== null) {
      errorPayload.maxChars = message.maxChars;
    }
    if (message.maxKm !== undefined && message.maxKm !== null) {
      errorPayload.maxKm = message.maxKm;
    }
    if (message.maxBase64Chars !== undefined && message.maxBase64Chars !== null) {
      errorPayload.maxBase64Chars = message.maxBase64Chars;
    }
    if (message.statusCode !== undefined && message.statusCode !== null) {
      errorPayload.statusCode = message.statusCode;
    }
    current.resolve(errorPayload);
  };

  socket.onclose = () => {
    ws = null;
    openPromise = null;
    stopKeepalive();
    rejectAllPending(new Error("voice-websocket-closed"));
  };

  socket.onerror = () => {
    // Error details are surfaced via close/timeout handlers.
  };
}

async function getSocket(): Promise<WebSocket> {
  if (ws?.readyState === WebSocket.OPEN) {
    return ws;
  }

  if (openPromise) {
    return openPromise;
  }

  openPromise = new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(VOICE_WS_URL);

    socket.onopen = () => {
      ws = socket;
      openPromise = null;
      attachSocketHandlers(socket);
      startKeepalive(socket);
      resolve(socket);
    };

    socket.onerror = () => {
      openPromise = null;
      reject(new Error("voice-websocket-connect-error"));
    };

    socket.onclose = () => {
      ws = null;
      openPromise = null;
      reject(new Error("voice-websocket-connect-closed"));
    };
  });

  return openPromise;
}

async function sendWsRequest<T>(
  action: "dialog" | "audio_chunk" | "audio_commit" | "clear_buffer",
  payload: unknown,
  timeoutMs = 30000
): Promise<T> {
  const socket = await getSocket();
  const id = createRequestId();

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("voice-websocket-timeout"));
    }, timeoutMs);

    pending.set(id, { resolve, reject, timer });

    socket.send(
      JSON.stringify({
        id,
        action,
        payload,
      })
    );
  });
}

export interface VoiceLocation {
  lat: number;
  lon: number;
  km?: number;
}

export interface VoiceAssistantResponse {
  provider?: string;
  model?: string;
  context?: unknown;
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
    format?: string;
    text?: string;
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
  if (!wsTransportDisabled) {
    try {
      const data = await sendWsRequest<VoiceAssistantResponse>("dialog", params, 60000);
      if (data?.error) {
        return data;
      }
      return data;
    } catch (error) {
      // If direct websocket transport is blocked (common with private Cloud Run IAM),
      // fallback to gateway HTTP proxy for this and following requests.
      wsTransportDisabled = true;
      console.warn("[voice] websocket unavailable, falling back to HTTP proxy", error);
    }
  }

  try {
    const data = await apiFetchJson<VoiceAssistantResponse>(VOICE_HTTP_DIALOG_PATH, {
      method: "POST",
      body: JSON.stringify(params),
    });
    if (data?.error) {
      return data;
    }
    return data;
  } catch (error) {
    return {
      error: "voice-request-failed",
      message: error instanceof Error ? error.message : "voice-http-fallback-failed",
    };
  }
}
