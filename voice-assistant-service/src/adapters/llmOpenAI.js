const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_LLM_MODEL = process.env.OPENAI_LLM_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 12000);
const OPENAI_LLM_MAX_TOKENS = Number(process.env.OPENAI_LLM_MAX_TOKENS || 180);

export async function buildAnswerWithOpenAI({ userText, toolResult }) {
  if (!OPENAI_API_KEY) {
    return {
      text: `No hay OPENAI_API_KEY configurada. Resultado de herramientas: ${JSON.stringify(toolResult)}`,
      provider: "fallback-local",
      model: "none",
    };
  }

  const system = [
    "Eres un asistente de gasolineras para móvil.",
    "Responde en español, muy breve, apto para voz.",
    "No inventes datos que no estén en el resultado de herramientas.",
    "Si faltan datos, dilo explícitamente y sugiere una acción corta.",
    "Si existe toolResult.speechHints, prioriza exactamente esos textos para leer precios.",
    "Los precios de combustible son decimales: 1,585 nunca se lee como mil quinientos ochenta y cinco.",
    "Pronuncia en formato natural: 1 euro con 58 centimos por litro.",
  ].join(" ");

  const user = [
    `Petición usuario: ${userText}`,
    `Resultado herramienta: ${JSON.stringify(toolResult)}`,
  ].join("\n");

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
      model: OPENAI_LLM_MODEL,
      temperature: 0.2,
      max_tokens: OPENAI_LLM_MAX_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  clearTimeout(timeout);

  const data = await response.json().catch(() => ({}));
  const text =
    data?.choices?.[0]?.message?.content?.trim() ||
    "No pude generar respuesta en este momento.";

  return {
    text,
    provider: "openai-llm",
    model: OPENAI_LLM_MODEL,
  };
}
