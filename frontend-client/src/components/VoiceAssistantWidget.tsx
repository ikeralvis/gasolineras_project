import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Mic, MicOff, Send, Sparkles, X } from "lucide-react";
import { askVoiceAssistant, transcribeVoiceChunk } from "../api/voiceAssistant";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
};

const QUICK_PROMPTS = [
  "Dime la más cercana",
  "Cual es la más cercana en 5 km",
  "Buscame una gasolinera cerca",
];

function mergeTranscript(base: string, incoming: string): string {
  const previous = base.trim();
  const next = incoming.trim();
  if (!next) return previous;
  if (!previous) return next;
  if (next === previous) return previous;
  if (next.startsWith(previous)) return next;
  if (previous.includes(next)) return previous;

  const maxOverlap = Math.min(previous.length, next.length);
  for (let i = maxOverlap; i > 0; i -= 1) {
    if (previous.slice(-i).toLowerCase() === next.slice(0, i).toLowerCase()) {
      return `${previous} ${next.slice(i).trim()}`.trim();
    }
  }

  return `${previous} ${next}`.trim();
}

function getCurrentLocation(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 4500 }
    );
  });
}

export default function VoiceAssistantWidget() {
  const isMobileDevice = /android|iphone|ipad|ipod|mobile/i.test(globalThis.navigator?.userAgent ?? "");
  const liveTuning = useMemo(
    () => ({
      timesliceMs: isMobileDevice ? 1200 : 1600,
      silenceMs: isMobileDevice ? 1800 : 1400,
      volumeThreshold: isMobileDevice ? 0.018 : 0.013,
      minTextToSend: isMobileDevice ? 6 : 4,
    }),
    [isMobileDevice]
  );

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [liveListening, setLiveListening] = useState(false);
  const [liveStatus, setLiveStatus] = useState("Pulsa Live para hablar");
  const [liveHeardText, setLiveHeardText] = useState("");
  const [liveMicLevel, setLiveMicLevel] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hola, soy TankGo AI. Pideme por ejemplo: Dime la más cercana.",
    },
  ]);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const processingChunkRef = useRef(false);
  const processingChainRef = useRef<Promise<void>>(Promise.resolve());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const liveMimeTypeRef = useRef("audio/webm");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelIntervalRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const speechDetectedRef = useRef(false);
  const liveSendingRef = useRef(false);
  const liveModeRef = useRef(false);
  const liveListeningRef = useRef(false);
  const liveDraftRef = useRef("");

  const canSend = useMemo(() => input.trim().length > 0 && !loading && !liveMode, [input, loading, liveMode]);

  useEffect(() => {
    if (!open) return;
    const container = document.getElementById("voice-chat-scroll");
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    return () => {
      stopLiveModeImmediate();
    };
  }, []);

  useEffect(() => {
    liveModeRef.current = liveMode;
  }, [liveMode]);

  useEffect(() => {
    liveListeningRef.current = liveListening;
  }, [liveListening]);

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const value = typeof reader.result === "string" ? reader.result : "";
        const commaIndex = value.indexOf(",");
        resolve(commaIndex >= 0 ? value.slice(commaIndex + 1) : value);
      };
      reader.onerror = () => reject(new Error("No se pudo leer el audio del microfono"));
      reader.readAsDataURL(blob);
    });
  }

  function stopCurrentAudio() {
    if (!currentAudioRef.current) return;
    currentAudioRef.current.pause();
    currentAudioRef.current.src = "";
    currentAudioRef.current = null;
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current != null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function cleanupAudioMetering() {
    if (levelIntervalRef.current != null) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    clearSilenceTimer();
    analyserRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    setLiveMicLevel(0);
    speechDetectedRef.current = false;
  }

  function stopBrowserRecognition() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore recognition stop errors.
      }
      recognitionRef.current = null;
    }
  }

  async function playAssistantAudio(audioBase64?: string, mimeType?: string) {
    if (!audioBase64) return;
    stopCurrentAudio();

    const mime = mimeType || "audio/mpeg";
    const audioSrc = `data:${mime};base64,${audioBase64}`;
    const audio = new Audio(audioSrc);
    currentAudioRef.current = audio;

    try {
      await audio.play();
    } catch {
      setLiveStatus("No se pudo reproducir audio automatico");
    }
  }

  function safeMimeType(): string {
    const candidates = ["audio/webm", "audio/mp4", "audio/ogg", "audio/webm;codecs=opus"];
    for (const candidate of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }
    return "audio/webm";
  }

  function stopLiveModeImmediate() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    mediaStreamRef.current = null;
    stopCurrentAudio();
    stopBrowserRecognition();
    cleanupAudioMetering();

    processingChunkRef.current = false;
    setLiveListening(false);
    setLiveMode(false);
    liveListeningRef.current = false;
    liveModeRef.current = false;
    setLiveStatus("Pulsa Live para hablar");
    setLiveHeardText("");
    liveSendingRef.current = false;
    recordedChunksRef.current = [];
    liveDraftRef.current = "";
  }

  async function processLiveChunk(blob: Blob, mimeType: string) {
    if (blob.size < 1800 || processingChunkRef.current) {
      return;
    }

    processingChunkRef.current = true;
    setLiveStatus(liveListening ? "Escuchando y transcribiendo..." : "Procesando audio final...");

    try {
      const audioBase64 = await blobToBase64(blob);
      const stt = await transcribeVoiceChunk({
        audioBase64,
        mimeType,
        language: "es",
      });

      const transcript = (stt?.text || "").trim();
      if (!transcript || transcript.length < 3) {
        setLiveStatus(liveListening ? "Escuchando..." : "No se detecto voz clara");
        return;
      }

      liveDraftRef.current = mergeTranscript(liveDraftRef.current, transcript);
      setLiveHeardText(liveDraftRef.current);
      setLiveStatus(liveListening ? "Escuchando..." : "Audio listo para enviar");
    } catch {
      setLiveStatus("Error al transcribir audio");
    } finally {
      processingChunkRef.current = false;
    }
  }

  function enqueueChunkProcessing(blob: Blob, mimeType: string) {
    processingChainRef.current = processingChainRef.current.then(async () => {
      await processLiveChunk(blob, mimeType);
    });
  }

  function startAudioMetering(stream: MediaStream) {
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.fftSize);
      levelIntervalRef.current = globalThis.setInterval(() => {
        const currentAnalyser = analyserRef.current;
        if (!currentAnalyser || !liveModeRef.current) {
          return;
        }

        currentAnalyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const sample of data) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / data.length);
        const normalizedLevel = Math.min(1, rms * 12);
        setLiveMicLevel(normalizedLevel);

        if (rms > liveTuning.volumeThreshold) {
          speechDetectedRef.current = true;
          clearSilenceTimer();
          if (liveListeningRef.current) {
            setLiveStatus("Escuchando...");
          }
          return;
        }

        if (
          liveListeningRef.current
          && speechDetectedRef.current
          && liveDraftRef.current.trim().length >= liveTuning.minTextToSend
          && silenceTimerRef.current == null
        ) {
          setLiveStatus("Silencio detectado. Enviando automaticamente...");
          silenceTimerRef.current = globalThis.setTimeout(() => {
            silenceTimerRef.current = null;
            void stopLiveModeAndSend("silence");
          }, liveTuning.silenceMs);
        }
      }, 180);
    } catch {
      // If metering fails, live mode still works with manual stop.
    }
  }

  async function startLiveMode() {
    if (liveMode || loading) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setLiveStatus("Tu navegador no soporta modo Live");
      return;
    }

    try {
      setLiveStatus("Pidiendo permiso de microfono...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const mimeType = safeMimeType();
      liveMimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          if (!recognitionRef.current) {
            enqueueChunkProcessing(event.data, mimeType);
          }
        }
      };
      recorder.onerror = () => {
        setLiveStatus("Fallo capturando audio");
        stopLiveModeImmediate();
      };
      recorder.onstop = () => {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
      };

      liveDraftRef.current = "";
      setLiveHeardText("");
      recordedChunksRef.current = [];
      recorder.start(liveTuning.timesliceMs);

      const RecognitionCtor = (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition;
      if (RecognitionCtor) {
        const recognition = new RecognitionCtor();
        recognition.lang = "es-ES";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
          let interim = "";
          let finalPart = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const text = String(event.results[i][0]?.transcript || "").trim();
            if (!text) continue;
            if (event.results[i].isFinal) {
              finalPart = mergeTranscript(finalPart, text);
            } else {
              interim = mergeTranscript(interim, text);
            }
          }

          if (finalPart) {
            liveDraftRef.current = mergeTranscript(liveDraftRef.current, finalPart);
          }

          const interimSuffix = interim ? ` ${interim}` : "";
          const preview = `${liveDraftRef.current}${interimSuffix}`.trim();
          if (preview) {
            setLiveHeardText(preview);
          }
        };
        recognition.onerror = () => {
          // Keep recorder fallback active.
        };
        try {
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          recognitionRef.current = null;
        }
      }

      startAudioMetering(stream);
      setLiveMode(true);
      setLiveListening(true);
      liveModeRef.current = true;
      liveListeningRef.current = true;
      setLiveStatus("Escuchando... (auto-envio por silencio activo)");
    } catch {
      setLiveStatus("Permiso de microfono denegado");
      stopLiveModeImmediate();
    }
  }

  async function stopLiveModeAndSend(reason: "manual" | "silence" = "manual") {
    if (!liveModeRef.current || liveSendingRef.current) return;

    liveSendingRef.current = true;
    clearSilenceTimer();

    setLiveListening(false);
    liveListeningRef.current = false;
    setLiveStatus(reason === "silence" ? "Silencio detectado. Enviando..." : "Procesando audio final...");

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        const onStop = () => {
          recorder.removeEventListener("stop", onStop);
          resolve();
        };
        recorder.addEventListener("stop", onStop);
        try {
          recorder.requestData();
        } catch {
          // Ignore requestData failures and continue stopping recorder.
        }
        recorder.stop();
      });
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    stopBrowserRecognition();
    cleanupAudioMetering();

    await processingChainRef.current;

    let finalText = liveDraftRef.current.trim();
    if (!finalText && recordedChunksRef.current.length > 0) {
      try {
        const finalBlob = new Blob(recordedChunksRef.current, { type: liveMimeTypeRef.current });
        if (finalBlob.size > 2500) {
          const finalAudioBase64 = await blobToBase64(finalBlob);
          const sttFinal = await transcribeVoiceChunk({
            audioBase64: finalAudioBase64,
            mimeType: liveMimeTypeRef.current,
            language: "es",
          });
          finalText = (sttFinal.text || "").trim();
          if (finalText) {
            setLiveHeardText(finalText);
          }
        }
      } catch {
        // Keep empty finalText behavior below.
      }
    }

    if (!finalText) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-live-empty-${Date.now()}`,
          role: "assistant",
          text: "No te he escuchado con claridad. Prueba otra vez hablando un poco mas alto.",
        },
      ]);
      setLiveStatus("No se detecto texto");
      setTimeout(() => {
        setLiveMode(false);
        liveModeRef.current = false;
        setLiveStatus("Pulsa Live para hablar");
      }, 1000);
      liveSendingRef.current = false;
      return;
    }

    const pendingId = `a-live-pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: `u-live-${Date.now()}`,
        role: "user",
        text: finalText,
      },
      {
        id: pendingId,
        role: "assistant",
        text: "Enviando...",
        pending: true,
      },
    ]);

    setLiveStatus("Enviando al asistente...");

    try {
      const location = await getCurrentLocation();
      const response = await askVoiceAssistant({
        text: finalText,
        location: location ? { ...location, km: 8 } : undefined,
        includeAudio: true,
      });

      const answerText =
        response?.answer?.text ||
        response?.message ||
        (response?.error ? `No pude resolverlo: ${response.error}` : "No tengo respuesta ahora mismo.");

      setMessages((prev) => {
        const trimmed = prev.filter((m) => m.id !== pendingId);
        return [
          ...trimmed,
          {
            id: `a-live-${Date.now()}`,
            role: "assistant",
            text: answerText,
          },
        ];
      });

      await playAssistantAudio(response?.tts?.audioBase64, response?.tts?.mimeType);
      setLiveStatus("Respuesta completada");
    } catch {
      setMessages((prev) => {
        const trimmed = prev.filter((m) => m.id !== pendingId);
        return [
          ...trimmed,
          {
            id: `a-live-err-${Date.now()}`,
            role: "assistant",
            text: "No pude enviar tu audio. Puedes usar el chat como fallback.",
          },
        ];
      });
      setLiveStatus("Error enviando al asistente");
    } finally {
      recordedChunksRef.current = [];
      liveDraftRef.current = "";
      setLiveHeardText("");
      setLiveMicLevel(0);
      setTimeout(() => {
        setLiveMode(false);
        liveModeRef.current = false;
        setLiveStatus("Pulsa Live para hablar");
      }, 700);
      liveSendingRef.current = false;
    }
  }

  async function sendPrompt(rawPrompt?: string) {
    const prompt = (rawPrompt ?? input).trim();
    if (!prompt || loading || liveMode) return;

    setInput("");
    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: prompt,
    };
    const pendingMessage: ChatMessage = {
      id: `a-pending-${Date.now()}`,
      role: "assistant",
      text: "Pensando...",
      pending: true,
    };

    setMessages((prev) => [...prev, userMessage, pendingMessage]);
    setLoading(true);

    try {
      const location = await getCurrentLocation();
      const response = await askVoiceAssistant({
        text: prompt,
        location: location ? { ...location, km: 8 } : undefined,
        includeAudio: false,
      });

      const answerText =
        response?.answer?.text ||
        response?.message ||
        (response?.error ? `No pude resolverlo: ${response.error}` : "No tengo respuesta ahora mismo.");

      setMessages((prev) => {
        const trimmed = prev.filter((m) => !m.pending);
        return [
          ...trimmed,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: answerText,
          },
        ];
      });
    } catch {
      setMessages((prev) => {
        const trimmed = prev.filter((m) => !m.pending);
        return [
          ...trimmed,
          {
            id: `a-err-${Date.now()}`,
            role: "assistant",
            text: "Ahora mismo no puedo conectar con el asistente. Intenta de nuevo en unos segundos.",
          },
        ];
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 z-1200 flex h-12 w-12 items-center justify-center rounded-full bg-[#000C74] text-white shadow-xl transition hover:scale-[1.02] md:bottom-6 md:right-6 md:h-14 md:w-14 bottom-22"
          aria-label="Abrir asistente TankGo"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      {open && (
        <section className="fixed z-1190 inset-0 md:inset-auto md:right-6 md:bottom-24 md:w-[min(92vw,720px)] md:h-[78vh] w-screen h-screen rounded-none md:rounded-2xl border border-[#DCE0FF] bg-white shadow-2xl overflow-hidden flex flex-col">
          <header className="flex items-center justify-between bg-linear-to-r from-[#000C74] to-[#1B2AA6] px-4 py-3 text-white shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <h3 className="text-sm font-semibold">TankGo AI Assistant</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-white/80">Beta</span>
              <button
                type="button"
                onClick={() => {
                  if (liveMode) {
                    stopLiveModeImmediate();
                  }
                  setOpen(false);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 hover:bg-white/25"
                aria-label="Cerrar asistente"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {liveMode ? (
            <div className="flex-1 flex flex-col items-center justify-between bg-radial-[at_50%_20%] from-[#E9EEFF] via-[#F8FAFF] to-[#F2F6FF] px-5 py-6">
              <div className="w-full flex items-center justify-between">
                <span className="text-xs font-semibold text-[#31447D] uppercase tracking-wide">Live Voice</span>
                <span className="text-xs text-[#4A5D99]">{liveStatus}</span>
              </div>

              <div className="flex-1 w-full max-w-xl flex flex-col items-center justify-center gap-5">
                <div className="relative flex items-center justify-center">
                  <div className={`absolute h-36 w-36 rounded-full bg-[#90A4FF]/40 blur-2xl ${liveListening ? "animate-pulse" : ""}`} />
                  <div className="relative h-24 w-24 rounded-full bg-[#0D1A8A] text-white flex items-center justify-center shadow-lg">
                    {liveListening ? <Mic className="h-8 w-8" /> : <MicOff className="h-8 w-8" />}
                  </div>
                </div>

                <div className="w-full grid grid-cols-7 gap-1 px-3">
                  {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                    <div
                      key={n}
                      className={`rounded-full bg-[#2540D6] ${liveListening ? "animate-pulse" : ""}`}
                      style={{
                        height: `${14 + ((n % 3) + 1) * 6 + Math.round(liveMicLevel * 26)}px`,
                        opacity: `${0.45 + Math.min(0.55, liveMicLevel)}`,
                        animationDelay: `${n * 90}ms`,
                      }}
                    />
                  ))}
                </div>

                <div className="w-full rounded-2xl border border-[#D9E0FF] bg-white/85 p-4 min-h-28">
                  <p className="text-xs uppercase tracking-wide text-[#5D6FA9] mb-2">Lo que escucho</p>
                  <p className="text-[#152452] text-sm leading-relaxed wrap-break-word">
                    {liveHeardText || "Habla ahora... iré transcribiendo en vivo."}
                    {liveListening && <span className="inline-block ml-1 w-2 h-4 bg-[#2A44D2] animate-pulse align-middle" />}
                  </p>
                </div>
              </div>

              <div className="w-full max-w-xl flex items-center justify-center gap-3">
                {liveListening ? (
                  <button
                    type="button"
                    onClick={() => {
                      void stopLiveModeAndSend("manual");
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#AF1E37] px-5 py-3 text-sm font-semibold text-white shadow-md"
                  >
                    <MicOff className="h-4 w-4" />
                    Parar y enviar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void startLiveMode();
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0A7A2F] px-5 py-3 text-sm font-semibold text-white shadow-md"
                  >
                    <Mic className="h-4 w-4" />
                    Reanudar Live
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div id="voice-chat-scroll" className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F7F8FF] min-h-0">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                      m.role === "user"
                        ? "ml-auto bg-[#000C74] text-white"
                        : "mr-auto bg-white text-[#12203D] border border-[#E1E5FF]"
                    }`}
                  >
                    {m.pending ? <span className="inline-block animate-pulse">{m.text}</span> : m.text}
                  </div>
                ))}
              </div>

              <div className="border-t border-[#E5E8FF] bg-white p-3 shrink-0">
                <div className="mb-2 rounded-xl border border-[#D7DBFF] bg-[#F6F8FF] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-[#1F2B6A]">Modo Live (estilo asistente de voz)</p>
                      <p className="text-[11px] text-[#51609B]">Habla y se enviara al detectar silencio</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void startLiveMode();
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#0A7A2F] px-2.5 py-1.5 text-[11px] font-semibold text-white"
                    >
                      <Mic className="h-3.5 w-3.5" />
                      Live
                    </button>
                  </div>
                </div>

                <div className="mb-2 flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendPrompt(q)}
                      className="rounded-full border border-[#D7DBFF] bg-[#F5F7FF] px-2.5 py-1 text-[11px] text-[#253778] hover:bg-[#EAF0FF]"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendPrompt();
                      }
                    }}
                    placeholder="Escribe tu consulta..."
                    className="flex-1 rounded-xl border border-[#D2D8FF] px-3 py-2 text-sm outline-none focus:border-[#6877E8] disabled:bg-[#F2F4FF]"
                    maxLength={420}
                    disabled={liveMode}
                  />
                  <button
                    type="button"
                    onClick={() => sendPrompt()}
                    disabled={!canSend}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#000C74] text-white disabled:opacity-50"
                    aria-label="Enviar"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
