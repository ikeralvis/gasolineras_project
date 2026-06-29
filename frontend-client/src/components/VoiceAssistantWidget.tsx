import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Send, Sparkles, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { askVoiceAssistant } from "../api/voiceAssistant";
import { useLocationContext } from "../contexts/LocationContext";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
};

type QuickPrompt = { labelKey: string; textKey: string };

const QUICK_PROMPT_KEYS: QuickPrompt[] = [
  { labelKey: "voice.quickNearest", textKey: "voice.quickNearestText" },
  { labelKey: "voice.quickCheapest5km", textKey: "voice.quickCheapest5kmText" },
  { labelKey: "voice.quickGasoline95", textKey: "voice.quickGasoline95Text" },
  { labelKey: "voice.quickDieselCheap", textKey: "voice.quickDieselCheapText" },
  { labelKey: "voice.quickMinPrice3km", textKey: "voice.quickMinPrice3kmText" },
];

const LANG_TO_BCP47: Record<string, string> = {
  es: "es-ES",
  en: "en-US",
  eu: "eu-ES",
};

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

function formatTtsFallbackReason(note: string | undefined, t: (key: string) => string): string {
  const normalized = String(note || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (normalized.includes("timeout")) {
    return t("voice.audioTimeout");
  }

  return "";
}

export default function VoiceAssistantWidget() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const isRoutesPage = location.pathname === "/rutas";
  const { location: userLocation } = useLocationContext();
  const speechLang = LANG_TO_BCP47[i18n.language] || "es-ES";
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
  const [liveUiHidden, setLiveUiHidden] = useState(false);
  const [liveProcessing, setLiveProcessing] = useState(false);
  const [liveListening, setLiveListening] = useState(false);
  const [liveStatus, setLiveStatus] = useState("Pulsa Live para hablar");
  const [liveHeardText, setLiveHeardText] = useState("");
  const [liveMicLevel, setLiveMicLevel] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 0 || (prev.length === 1 && prev[0].id === "welcome")) {
        return [{ id: "welcome", role: "assistant", text: t("voice.welcomeMessage") }];
      }
      return prev.map((m) => m.id === "welcome" ? { ...m, text: t("voice.welcomeMessage") } : m);
    });
  }, [i18n.language, t]);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
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
  const adaptiveVolumeThresholdRef = useRef(liveTuning.volumeThreshold);
  const calibrationRemainingRef = useRef(0);
  const noiseFloorSamplesRef = useRef<number[]>([]);

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

  useEffect(() => {
    if (!liveModeRef.current) {
      adaptiveVolumeThresholdRef.current = liveTuning.volumeThreshold;
    }
  }, [liveTuning.volumeThreshold]);

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

  function speakWithBrowserTts(text: string): boolean {
    const content = String(text || "").trim();
    if (!content) {
      return false;
    }

    if (globalThis.speechSynthesis === undefined || globalThis.SpeechSynthesisUtterance === undefined) {
      return false;
    }

    try {
      globalThis.speechSynthesis.cancel();
      const utterance = new globalThis.SpeechSynthesisUtterance(content);
      utterance.lang = speechLang;
      utterance.rate = 1;
      globalThis.speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  function stopCurrentAudio() {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
    }

    if (globalThis.speechSynthesis !== undefined) {
      globalThis.speechSynthesis.cancel();
    }
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
    calibrationRemainingRef.current = 0;
    noiseFloorSamplesRef.current = [];
    adaptiveVolumeThresholdRef.current = liveTuning.volumeThreshold;
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

  async function playAssistantAudio(audioBase64?: string, mimeType?: string): Promise<boolean> {
    if (!audioBase64) return false;
    stopCurrentAudio();

    const mime = String(mimeType || "audio/wav").trim();
    const audio = new Audio(`data:${mime};base64,${audioBase64}`);
    currentAudioRef.current = audio;

    try {
      await audio.play();
      return true;
    } catch {
      stopCurrentAudio();
      return false;
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

    setLiveListening(false);
    setLiveMode(false);
    setLiveUiHidden(false);
    setLiveProcessing(false);
    liveListeningRef.current = false;
    liveModeRef.current = false;
    setLiveStatus(t("voice.pressLiveToTalk"));
    setLiveHeardText("");
    liveSendingRef.current = false;
    recordedChunksRef.current = [];
    liveDraftRef.current = "";
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

        if (calibrationRemainingRef.current > 0) {
          noiseFloorSamplesRef.current.push(rms);
          calibrationRemainingRef.current -= 1;

          if (calibrationRemainingRef.current === 0 && noiseFloorSamplesRef.current.length > 0) {
            const avgNoise =
              noiseFloorSamplesRef.current.reduce((acc, value) => acc + value, 0) /
              noiseFloorSamplesRef.current.length;
            adaptiveVolumeThresholdRef.current = Math.max(liveTuning.volumeThreshold, avgNoise * 2.4);

            if (liveListeningRef.current) {
              setLiveStatus(t("voice.listening"));
            }
          }

          return;
        }

        if (rms > adaptiveVolumeThresholdRef.current) {
          speechDetectedRef.current = true;
          clearSilenceTimer();
          if (liveListeningRef.current) {
            setLiveStatus(t("voice.listening"));
          }
          return;
        }

        if (
          liveListeningRef.current
          && speechDetectedRef.current
          && recordedChunksRef.current.length > 0
          && silenceTimerRef.current == null
        ) {
          setLiveStatus(t("voice.silenceDetectedSending"));
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
      setLiveStatus(t("voice.liveNotSupported"));
      return;
    }

    try {
      setLiveStatus(t("voice.micPermissionRequest"));
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
        }
      };
      recorder.onerror = () => {
        setLiveStatus(t("voice.micCaptureFailed"));
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
      setLiveUiHidden(false);
      setLiveProcessing(false);
      recordedChunksRef.current = [];
      calibrationRemainingRef.current = 8;
      noiseFloorSamplesRef.current = [];
      adaptiveVolumeThresholdRef.current = liveTuning.volumeThreshold;
      recorder.start(liveTuning.timesliceMs);

      const RecognitionCtor = (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition;
      if (RecognitionCtor) {
        const recognition = new RecognitionCtor();
        recognition.lang = speechLang;
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
      setLiveStatus(t("voice.listeningCalibrating"));
    } catch {
      setLiveStatus(t("voice.micPermissionDenied"));
      stopLiveModeImmediate();
    }
  }

  function scheduleLiveModeReset(delayMs = 700) {
    setTimeout(() => {
      setLiveMode(false);
      liveModeRef.current = false;
      setLiveStatus(t("voice.pressLiveToTalk"));
      setLiveUiHidden(false);
      setLiveProcessing(false);
    }, delayMs);
  }

  async function stopLiveModeAndSend(reason: "manual" | "silence" = "manual") {
    if (!liveModeRef.current || liveSendingRef.current) return;

    liveSendingRef.current = true;
    clearSilenceTimer();
    setLiveProcessing(true);
    setLiveUiHidden(true);

    setLiveListening(false);
    liveListeningRef.current = false;
    setLiveStatus(reason === "silence" ? t("voice.silenceDetectedSendingShort") : t("voice.processingFinalAudio"));

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

    const finalBlob = new Blob(recordedChunksRef.current, { type: liveMimeTypeRef.current });
    if (finalBlob.size <= 2500) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-live-empty-${Date.now()}`,
          role: "assistant",
          text: t("voice.notHeard"),
        },
      ]);
      setLiveStatus(t("voice.noTextDetected"));
      scheduleLiveModeReset(1000);
      liveSendingRef.current = false;
      setLiveProcessing(false);
      setLiveUiHidden(false);
      return;
    }

    const finalAudioBase64 = await blobToBase64(finalBlob);
    const previewText = liveHeardText.trim() || liveDraftRef.current.trim();

    const userMsgId = `u-live-${Date.now()}`;
    const pendingId = `a-live-pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        text: previewText || t("voice.processingVoice"),
      },
      {
        id: pendingId,
        role: "assistant",
        text: t("voice.sending"),
        pending: true,
      },
    ]);

    setLiveStatus(t("voice.sendingToAssistant"));

    try {
      const response = await askVoiceAssistant({
        text: previewText || undefined,
        audioBase64: finalAudioBase64,
        mimeType: liveMimeTypeRef.current,
        location: userLocation ? { ...userLocation, km: 8 } : undefined,
        includeAudio: true,
      });

      const answerText =
        response?.answer?.text ||
        response?.message ||
        (response?.error ? `${t("voice.cannotResolve")}: ${response.error}` : t("voice.noAnswer"));

      const sttTranscript = response?.context?.sttTranscript;

      setMessages((prev) => {
        const withTranscript = sttTranscript
          ? prev.map((m) => (m.id === userMsgId ? { ...m, text: sttTranscript } : m))
          : prev;
        const trimmed = withTranscript.filter((m) => m.id !== pendingId);
        return [
          ...trimmed,
          {
            id: `a-live-${Date.now()}`,
            role: "assistant",
            text: answerText,
          },
        ];
      });

      const hasTtsAudio = Boolean(response?.tts?.audioBase64);
      if (hasTtsAudio) {
        const played = await playAssistantAudio(response?.tts?.audioBase64, response?.tts?.mimeType);
        if (played) {
          setLiveStatus(t("voice.voiceResponsePlayed"));
        } else if (speakWithBrowserTts(answerText)) {
          setLiveStatus(t("voice.ttsFallbackBrowser"));
        } else {
          setLiveStatus(t("voice.cannotPlayAudio"));
        }
      } else {
        const ttsReason = formatTtsFallbackReason(response?.tts?.note, t);
        setMessages((prev) => [
          ...prev,
          {
            id: `a-live-audio-${Date.now()}`,
            role: "assistant",
            text: `${t("voice.respondedInText")}${ttsReason}.`,
          },
        ]);
        setLiveStatus(t("voice.responseInText"));
      }
    } catch {
      setMessages((prev) => {
        const trimmed = prev.filter((m) => m.id !== pendingId);
        return [
          ...trimmed,
          {
            id: `a-live-err-${Date.now()}`,
            role: "assistant",
            text: t("voice.cannotSendAudio"),
          },
        ];
      });
      setLiveStatus(t("voice.sendError"));
    } finally {
      recordedChunksRef.current = [];
      liveDraftRef.current = "";
      setLiveHeardText("");
      setLiveMicLevel(0);
      setLiveProcessing(false);
      scheduleLiveModeReset();
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
      text: t("voice.thinking"),
      pending: true,
    };

    setMessages((prev) => [...prev, userMessage, pendingMessage]);
    setLoading(true);

    try {
      const response = await askVoiceAssistant({
        text: prompt,
        location: userLocation ? { ...userLocation, km: 8 } : undefined,
        includeAudio: true,
      });

      const answerText =
        response?.answer?.text ||
        response?.message ||
        (response?.error ? `${t("voice.cannotResolve")}: ${response.error}` : t("voice.noAnswer"));

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

      const hasTtsAudio = Boolean(response?.tts?.audioBase64);
      if (hasTtsAudio) {
        const played = await playAssistantAudio(response?.tts?.audioBase64, response?.tts?.mimeType);
        if (!played) {
          speakWithBrowserTts(answerText);
        }
      } else {
        speakWithBrowserTts(answerText);
      }
    } catch {
      setMessages((prev) => {
        const trimmed = prev.filter((m) => !m.pending);
        return [
          ...trimmed,
          {
            id: `a-err-${Date.now()}`,
            role: "assistant",
            text: t("voice.cannotConnect"),
          },
        ];
      });
    } finally {
      setLoading(false);
    }
  }

  // Live mode is active and showing transcription overlay
  const showLiveOverlay = liveMode && !liveUiHidden;

  return (
    <>
      {/* ── FAB button when closed ── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`fixed right-4 z-[1200] flex h-14 w-14 items-center justify-center rounded-full bg-[#000C74] text-white shadow-2xl transition-transform hover:scale-105 active:scale-95 md:right-6 md:h-16 md:w-16 md:bottom-6 ${isRoutesPage ? "bottom-[7.25rem]" : "bottom-[5.5rem]"}`}
          aria-label={t("voice.openAssistant")}
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {open && (
        <section className="fixed inset-0 z-[1190] flex flex-col bg-white md:inset-auto md:right-6 md:bottom-6 md:w-[420px] md:h-[82vh] md:max-h-[700px] md:rounded-3xl md:shadow-2xl md:border md:border-[#E0E4FF] overflow-hidden">

          {/* ── Header ── */}
          <header className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#000C74] text-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-none">TankGo AI</p>
                <p className="text-[11px] text-white/60 mt-0.5 truncate">
                  {showLiveOverlay
                    ? liveStatus
                    : liveProcessing
                      ? t("voice.processingAudio")
                      : userLocation
                        ? t("voice.locationDetected")
                        : t("voice.voiceAssistant")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {liveMode && (
                <span className="flex items-center gap-1 rounded-full bg-red-500/20 border border-red-400/40 px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-red-300 uppercase">Live</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => { if (liveMode) stopLiveModeImmediate(); setOpen(false); }}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition"
                aria-label={t("voice.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* ── Live voice overlay ── */}
          {showLiveOverlay ? (
            <div className="flex-1 flex flex-col items-center justify-between px-5 py-6 bg-[#F4F6FF]">
              {/* Mic visualizer */}
              <div className="flex-1 w-full flex flex-col items-center justify-center gap-6">
                <div className="relative flex items-center justify-center">
                  <div className={`absolute h-40 w-40 rounded-full bg-[#3B5BDB]/20 blur-3xl ${liveListening ? "animate-pulse" : ""}`} />
                  <div className={`relative h-28 w-28 rounded-full flex items-center justify-center shadow-xl transition-all ${liveListening ? "bg-[#0D1A8A] scale-100" : "bg-[#374A8C] scale-95"}`}>
                    {liveListening
                      ? <Mic className="h-10 w-10 text-white" />
                      : <MicOff className="h-10 w-10 text-white/70" />
                    }
                  </div>
                </div>

                {/* Waveform bars */}
                <div className="flex items-end justify-center gap-1.5 h-12 w-full max-w-xs">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <div
                      key={n}
                      className="rounded-full bg-[#2540D6] w-2 transition-all duration-75"
                      style={{
                        height: `${Math.max(8, 12 + ((n % 3) + 1) * 5 + Math.round(liveMicLevel * 30))}px`,
                        opacity: liveListening ? 0.5 + Math.min(0.5, liveMicLevel) : 0.25,
                      }}
                    />
                  ))}
                </div>

                {/* Transcript box */}
                <div className="w-full rounded-2xl border border-[#D0D8FF] bg-white px-4 py-3 min-h-[80px]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B8FCC] mb-1.5">{t("voice.escuchando")}</p>
                  <p className="text-[#152452] text-lg font-medium leading-snug">
                    {liveHeardText || <span className="text-[#A0AECF] italic text-base">{t("voice.speakNow")}</span>}
                    {liveListening && <span className="inline-block ml-1 w-0.5 h-5 bg-[#2A44D2] animate-pulse align-middle" />}
                  </p>
                </div>
              </div>

              {/* Stop button */}
              <div className="w-full flex justify-center pt-4">
                {liveListening ? (
                  <button
                    type="button"
                    onClick={() => { void stopLiveModeAndSend("manual"); }}
                    className="flex items-center gap-3 rounded-2xl bg-[#C0152A] px-8 py-4 text-lg font-bold text-white shadow-lg active:scale-95 transition-transform"
                  >
                    <MicOff className="h-6 w-6" />
                    {t("voice.stopAndSend")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { void startLiveMode(); }}
                    className="flex items-center gap-3 rounded-2xl bg-[#0A6B28] px-8 py-4 text-lg font-bold text-white shadow-lg active:scale-95 transition-transform"
                  >
                    <Mic className="h-6 w-6" />
                    {t("voice.resume")}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* ── Processing banner ── */}
              {liveProcessing && (
                <div className="mx-3 mt-2 rounded-xl bg-[#EEF1FF] border border-[#C7CFFF] px-4 py-2.5 flex items-center gap-3 shrink-0">
                  <span className="h-4 w-4 rounded-full border-2 border-[#3B4FD4]/30 border-t-[#3B4FD4] animate-spin shrink-0" />
                  <span className="text-sm font-semibold text-[#1B2A6B]">{t("voice.processingYourAudio")}</span>
                </div>
              )}

              {/* ── Quick prompts ── */}
              <div className="shrink-0 px-3 pt-2.5 pb-0">
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                  {QUICK_PROMPT_KEYS.map((q) => (
                    <button
                      key={q.labelKey}
                      type="button"
                      onClick={() => sendPrompt(t(q.textKey))}
                      disabled={loading || liveMode}
                      className="flex-none rounded-full border border-[#D0D8FF] bg-[#F4F6FF] px-3.5 py-2 text-xs font-semibold text-[#1E3A8A] whitespace-nowrap hover:bg-[#E0E8FF] active:bg-[#C7D4FF] disabled:opacity-40 transition"
                    >
                      {t(q.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Chat messages ── */}
              <div id="voice-chat-scroll" className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5 bg-[#F9FAFE] min-h-0">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-base leading-relaxed shadow-sm ${
                      m.role === "user"
                        ? "ml-auto bg-[#000C74] text-white rounded-br-sm"
                        : "mr-auto bg-white text-[#111827] border border-[#E5E9FF] rounded-bl-sm"
                    }`}
                  >
                    {m.pending ? (
                      <span className="flex items-center gap-2.5">
                        <span className="h-4 w-4 rounded-full border-2 border-[#1B2AA6]/20 border-t-[#1B2AA6] animate-spin shrink-0" />
                        <span className="font-medium text-[#3B54C0]">{m.text}</span>
                      </span>
                    ) : m.text}
                  </div>
                ))}
              </div>

              {/* ── Bottom toolbar ── */}
              <div className="shrink-0 bg-white border-t border-[#E5E8FF] px-3 pt-2.5 pb-3 space-y-2.5">
                {/* Text input row */}
                <div className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendPrompt(); } }}
                    placeholder={t("voice.inputPlaceholder")}
                    className="flex-1 rounded-xl border border-[#D0D8FF] bg-[#F9FAFE] px-3.5 py-2.5 text-base outline-none focus:border-[#4F6FD4] focus:bg-white disabled:opacity-50 transition"
                    maxLength={420}
                    disabled={liveMode || loading}
                  />
                  <button
                    type="button"
                    onClick={() => sendPrompt()}
                    disabled={!canSend}
                    className="h-11 w-11 flex items-center justify-center rounded-xl bg-[#000C74] text-white disabled:opacity-30 transition active:scale-95"
                    aria-label={t("voice.send")}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>

                {/* Mic button — primary CTA for car use */}
                <button
                  type="button"
                  onClick={() => { void startLiveMode(); }}
                  disabled={loading || liveMode}
                  className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-[#0A6B28] hover:bg-[#085E23] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white py-3.5 text-base font-bold shadow-md transition-all"
                >
                  <Mic className="h-5 w-5" />
                  {t("voice.talkToAssistant")}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
