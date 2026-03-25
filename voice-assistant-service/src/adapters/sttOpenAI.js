const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_STT_MODEL = process.env.OPENAI_STT_MODEL || "whisper-1";

function extFromMime(mimeType = "audio/webm") {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mpga")) return "mpga";
  if (mimeType.includes("flac")) return "flac";
  if (mimeType.includes("oga")) return "oga";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export async function transcribeWithOpenAI({ audioBase64, mimeType = "audio/webm", language = "es", prompt = "" }) {
  if (!audioBase64 || typeof audioBase64 !== "string") {
    throw new Error("audioBase64 is required");
  }

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const normalizedMimeType = String(mimeType || "audio/webm").split(";")[0].trim().toLowerCase() || "audio/webm";
  const audioBuffer = Buffer.from(audioBase64, "base64");
  const fileBlob = new Blob([audioBuffer], { type: normalizedMimeType });
  const ext = extFromMime(normalizedMimeType);

  const form = new FormData();
  form.append("model", OPENAI_STT_MODEL);
  form.append("language", language);
  if (prompt) {
    form.append("prompt", prompt);
  }
  form.append("file", fileBlob, `audio.${ext}`);

  const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`STT failed ${response.status} (mime=${normalizedMimeType}, ext=${ext}, bytes=${audioBuffer.byteLength}): ${JSON.stringify(data).slice(0, 340)}`);
  }

  return {
    text: data?.text || "",
    provider: "openai-whisper",
    model: OPENAI_STT_MODEL,
  };
}
