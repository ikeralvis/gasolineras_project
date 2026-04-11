function buildVoiceWsUrl(): string {
  const fromEnv = (import.meta.env.VITE_VOICE_WS_URL ?? "").trim();
  if (fromEnv) {
    return fromEnv;
  }

  return "ws://localhost:8090/ws/voice";
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
  try {
    const data = await sendWsRequest<VoiceAssistantResponse>("dialog", params, 60000);
    if (data?.error) {
      return data;
    }
    return data;
  } catch (error) {
    return {
      error: "voice-request-failed",
      message: error instanceof Error ? error.message : "voice-websocket-failed",
    };
  }
}
