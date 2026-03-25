const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_ROUTER_MODEL = process.env.OPENAI_ROUTER_MODEL || process.env.OPENAI_LLM_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 12000);
const OPENAI_ROUTER_MAX_TOKENS = Number(process.env.OPENAI_ROUTER_MAX_TOKENS || 80);

function fallbackIntent(text = "") {
  const lower = text.toLowerCase();
  if (lower.includes("más cercana") || lower.includes("mas cercana") || lower.includes("cerca")) {
    return { intent: "nearest", confidence: 0.7, provider: "fallback-rules" };
  }
  return { intent: "unknown", confidence: 0.4, provider: "fallback-rules" };
}

export async function detectIntentWithOpenAI(text = "") {
  if (!OPENAI_API_KEY) {
    return fallbackIntent(text);
  }

  const system = [
    "Eres un clasificador de intención para una app de gasolineras.",
    "Devuelve SOLO JSON válido con campos: intent, confidence.",
    "intent permitido: nearest, unknown.",
    "confidence entre 0 y 1.",
  ].join(" ");

  const user = `Texto usuario: ${text}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_ROUTER_MODEL,
      temperature: 0,
      max_tokens: OPENAI_ROUTER_MAX_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  clearTimeout(timeout);

  const data = await response.json().catch(() => ({}));
  const content = data?.choices?.[0]?.message?.content || "";

  try {
    const parsed = JSON.parse(content);
    const intent = parsed?.intent === "nearest" ? "nearest" : "unknown";
    const confidence = Number(parsed?.confidence);
    return {
      intent,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
      provider: "openai-router",
    };
  } catch {
    return fallbackIntent(text);
  }
}
