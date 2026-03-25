const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "nova";
const OPENAI_TTS_FORMAT = process.env.OPENAI_TTS_FORMAT || "mp3";

export async function synthesizeSpeechWithOpenAI(text, { includeAudio = false } = {}) {
  if (!text || typeof text !== "string") {
    return {
      provider: "openai-tts",
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      format: OPENAI_TTS_FORMAT,
      note: "No input text provided",
    };
  }

  if (!OPENAI_API_KEY) {
    return {
      provider: "openai-tts",
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      format: OPENAI_TTS_FORMAT,
      note: "OPENAI_API_KEY no configurada",
    };
  }

  if (!includeAudio) {
    return {
      provider: "openai-tts",
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      format: OPENAI_TTS_FORMAT,
      note: "Audio omitido (includeAudio=false)",
      text,
    };
  }

  const response = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      format: OPENAI_TTS_FORMAT,
      input: text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`TTS failed ${response.status}: ${detail.slice(0, 240)}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const audioBase64 = bytes.toString("base64");

  return {
    provider: "openai-tts",
    model: OPENAI_TTS_MODEL,
    voice: OPENAI_TTS_VOICE,
    format: OPENAI_TTS_FORMAT,
    mimeType: OPENAI_TTS_FORMAT === "mp3" ? "audio/mpeg" : `audio/${OPENAI_TTS_FORMAT}`,
    audioBase64,
    chars: text.length,
  };
}
