import { API_BASE_URL, apiFetchJson } from "./http";

const VOICE_WS_PROXY_PATH = "/api/voice/ws";
const DEFAULT_LOCAL_VOICE_WS_URL = "ws://localhost:8080/api/voice/ws";
const VOICE_HTTP_DIALOG_PATH = "/api/voice/dialog";

function parseBooleanEnv(rawValue: unknown, fallbackValue: boolean): boolean {
  if (rawValue == null) {
    return fallbackValue;
  }

  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  if (typeof rawValue !== "string" && typeof rawValue !== "number") {
    return fallbackValue;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (!normalized) {
    return fallbackValue;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallbackValue;
}

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
    parsed.pathname = VOICE_WS_PROXY_PATH;
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

function isGatewayVoiceWsPath(pathname: string): boolean {
  return pathname === VOICE_WS_PROXY_PATH;
}

function isSafeExplicitVoiceWsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!isGatewayVoiceWsPath(parsed.pathname)) {
      return false;
    }

    const apiBase = (API_BASE_URL || "").trim();
    if (!apiBase) {
      return true;
    }

    const apiOrigin = new URL(apiBase).origin;
    return parsed.origin === apiOrigin;
  } catch {
    return false;
  }
}

function buildVoiceWsUrl(): string {
  const fromExplicitWsEnv = normalizeVoiceWsUrl(import.meta.env.VITE_VOICE_WS_URL ?? "");
  if (fromExplicitWsEnv && isSafeExplicitVoiceWsUrl(fromExplicitWsEnv)) {
    return fromExplicitWsEnv;
  }

  if (fromExplicitWsEnv) {
    console.warn("[voice] ignoring unsafe VITE_VOICE_WS_URL; using gateway bridge");
  }

  const fromApiBaseEnv = toWsUrlFromHttpBase((API_BASE_URL || "").trim());
  if (fromApiBaseEnv) {
    return fromApiBaseEnv;
  }

  if (globalThis.window !== undefined) {
    const protocol = globalThis.window.location.protocol === "https:" ? "wss:" : "ws:";
    if (isLocalHostname(globalThis.window.location.hostname)) {
      return DEFAULT_LOCAL_VOICE_WS_URL;
    }
    return `${protocol}//${globalThis.window.location.host}${VOICE_WS_PROXY_PATH}`;
  }

  return DEFAULT_LOCAL_VOICE_WS_URL;
}

const EXPLICIT_VOICE_WS_URL = normalizeVoiceWsUrl(import.meta.env.VITE_VOICE_WS_URL ?? "");
const VOICE_WS_ENABLED = parseBooleanEnv(
  import.meta.env.VITE_VOICE_WS_ENABLED,
  Boolean(EXPLICIT_VOICE_WS_URL) || !import.meta.env.PROD
);
const VOICE_WS_URL = VOICE_WS_ENABLED ? buildVoiceWsUrl() : null;
const VOICE_WS_KEEPALIVE_MS = 25000;
const VOICE_WS_FAILURE_THRESHOLD = 2;
const VOICE_WS_RETRY_COOLDOWN_MS = 20000;

type WsPending = {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

let ws: WebSocket | null = null;
let openPromise: Promise<WebSocket> | null = null;
const pending = new Map<string, WsPending>();
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let wsConsecutiveFailures = 0;
let wsDisabledUntilTs = 0;

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

function hardResetSocket() {
  stopKeepalive();
  rejectAllPending(new Error("voice-websocket-reset"));

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    try {
      ws.close();
    } catch {
      // Ignore close errors.
    }
  }

  ws = null;
  openPromise = null;
}

function canUseWsTransport() {
  return VOICE_WS_ENABLED && Boolean(VOICE_WS_URL) && Date.now() >= wsDisabledUntilTs;
}

function markWsSuccess() {
  wsConsecutiveFailures = 0;
  wsDisabledUntilTs = 0;
}

function markWsFailure(error: unknown) {
  wsConsecutiveFailures += 1;
  if (wsConsecutiveFailures >= VOICE_WS_FAILURE_THRESHOLD) {
    wsDisabledUntilTs = Date.now() + VOICE_WS_RETRY_COOLDOWN_MS;
  }

  hardResetSocket();
  console.warn("[voice] websocket unavailable, using HTTP fallback", {
    error,
    consecutiveFailures: wsConsecutiveFailures,
    retryAfterMs: Math.max(wsDisabledUntilTs - Date.now(), 0),
  });
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

function shouldResetSocketFromMessage(message: any): boolean {
  if (message?.type === "error") {
    return true;
  }

  return message?.type === "response" && message?.ok === false && !message?.id;
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

    if (shouldResetSocketFromMessage(message)) {
      hardResetSocket();
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
  if (!VOICE_WS_URL) {
    throw new Error("voice-websocket-disabled");
  }

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
  if (canUseWsTransport()) {
    try {
      const data = await sendWsRequest<VoiceAssistantResponse>("dialog", params, 60000);
      markWsSuccess();
      if (data?.error) {
        return data;
      }
      return data;
    } catch (error) {
      // Use HTTP fallback for this request and retry websocket automatically later.
      markWsFailure(error);
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
