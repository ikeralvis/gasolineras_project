/**
 * Trazabilidad opcional con Langfuse — Métrica 3: Tasa de Éxito de Tarea.
 *
 * Activo solo si LANGFUSE_PUBLIC_KEY y LANGFUSE_SECRET_KEY están configurados.
 * Sin esas variables es un no-op: no falla, no imprime nada.
 *
 * Instalar cuando quieras activarlo:
 *   npm install langfuse
 *
 * Variables de entorno necesarias:
 *   LANGFUSE_PUBLIC_KEY=pk-lf-...
 *   LANGFUSE_SECRET_KEY=sk-lf-...
 *   LANGFUSE_HOST=https://cloud.langfuse.com  (opcional, este es el default)
 */

let _lf = null;
let _ready = false;

async function getLangfuse() {
  if (_ready) return _lf;
  _ready = true;

  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  if (!pk || !sk) return null;

  try {
    const { Langfuse } = await import("langfuse");
    _lf = new Langfuse({
      publicKey: pk,
      secretKey:  sk,
      baseUrl:    process.env.LANGFUSE_HOST || "https://cloud.langfuse.com",
      flushAt:    1,
    });
  } catch {
    // langfuse no instalado — tracer desactivado
  }
  return _lf;
}

function computeTaskSuccess(result) {
  if (!String(result?.answer?.text || "").trim()) return 0;
  const toolOutputs = result?.context?.toolOutputs ?? [];
  const allToolsOk = toolOutputs.every((t) => t?.output?.ok !== false);
  return allToolsOk ? 1 : 0;
}

/**
 * Envía un trace a Langfuse. Fire-and-forget: no bloquea el pipeline.
 *
 * @param {object} input   - { text, audioBase64, location }
 * @param {object} result  - respuesta de runPipelineDialog
 * @param {number} latencyMs
 */
export async function traceResult(input, result, latencyMs) {
  const lf = await getLangfuse();
  if (!lf) return;

  try {
    const toolCalled = result?.context?.toolOutputs?.[0]?.name ?? null;
    const taskSuccess = computeTaskSuccess(result);

    const trace = lf.trace({
      name: "voice-pipeline",
      input: {
        has_text:     Boolean(input.text),
        has_audio:    Boolean(input.audioBase64),
        has_location: Boolean(input.location),
      },
      output: {
        intent:               result?.context?.intent ?? null,
        language:             result?.context?.language ?? null,
        tool_called:          toolCalled,
        answer_chars:         result?.answer?.text?.length ?? 0,
        guardrails_triggered: result?.context?.guardrailsTriggered ?? false,
        stt_provider:         result?.pipeline?.stt ?? null,
        tts_provider:         result?.pipeline?.tts ?? null,
      },
      metadata: { latency_ms: latencyMs },
    });

    // ── Scores para las 3 métricas ────────────────────────────────────────
    trace.score({ name: "task_success",          value: taskSuccess });
    trace.score({ name: "guardrails_triggered",  value: result?.context?.guardrailsTriggered ? 1 : 0 });
    if (toolCalled) {
      // tool_called_name permite filtrar por herramienta en el dashboard
      trace.score({ name: "tool_called", value: 1, comment: toolCalled });
    }

    lf.flushAsync().catch(() => {});
  } catch {
    // never crash the main pipeline due to tracing
  }
}
