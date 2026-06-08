/**
 * Evaluación offline del agente de voz TankGo.
 *
 * Corre las métricas 1-3 contra funciones deterministas (sin llamadas API):
 *   1. Precisión en Selección de Herramientas  — classifyIntent()
 *   2. Efectividad de los Guardarraíles         — isInScope()
 *   3. Detección de Idioma (regresión)          — detectLanguageFromText()
 *
 * La métrica de Tasa de Éxito de Tarea (end-to-end) se captura online vía Langfuse.
 *
 * Uso:
 *   node eval/metrics.js
 */

import { writeFileSync } from "node:fs";
import { classifyIntent, isInScope, detectLanguageFromText, extractBrand } from "../src/adapters/pipelineDialog.js";
import { TOOL_CASES, GUARDRAIL_CASES, LANGUAGE_CASES, BRAND_EXTRACTION_CASES } from "./dataset.js";

// ── Métrica 1: Precisión en Selección de Herramientas ────────────────────────

function evalToolSelection() {
  const INTENT_TO_TOOL = {
    prices:  "get_prices",
    nearest: "get_nearest_stations",
    unknown: null,
  };

  const rows = TOOL_CASES.map((tc) => {
    const { type } = classifyIntent(tc.text);
    const pass = type === tc.expected;
    return { ...tc, predicted: type, predictedTool: INTENT_TO_TOOL[type], pass };
  });

  const correct = rows.filter((r) => r.pass).length;
  return {
    metric: "tool_selection_precision",
    score: correct / rows.length,
    correct,
    total: rows.length,
    errors: rows.filter((r) => !r.pass),
    rows,
  };
}

// ── Métrica 2: Efectividad de los Guardarraíles ───────────────────────────────

function evalGuardrails() {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  const errors = [];

  for (const tc of GUARDRAIL_CASES) {
    const actual = isInScope(tc.text);
    if (!tc.expected_in_scope && !actual) tp++;        // fuera-de-ámbito bloqueado ✓
    else if (tc.expected_in_scope && actual)  tn++;    // en-ámbito permitido ✓
    else if (!tc.expected_in_scope && actual) fp++;    // debía bloquearse, pasó ✗
    else fn++;                                          // debía pasar, bloqueado ✗

    if (actual !== tc.expected_in_scope) {
      errors.push({ id: tc.id, text: tc.text, expected: tc.expected_in_scope, actual });
    }
  }

  const total     = tp + tn + fp + fn;
  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 1;
  const recall    = (tp + fn) > 0 ? tp / (tp + fn) : 1;
  const f1        = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 1;
  return {
    metric: "guardrails_effectiveness",
    accuracy: (tp + tn) / total,
    precision,
    recall,
    f1,
    confusion: { tp, tn, fp, fn },
    total,
    errors,
  };
}

// ── Detección de idioma (regresión) ──────────────────────────────────────────

function evalLanguageDetection() {
  const rows = LANGUAGE_CASES.map((tc) => {
    const predicted = detectLanguageFromText(tc.text);
    const pass = predicted === tc.expected;
    return { ...tc, predicted, pass };
  });

  const correct = rows.filter((r) => r.pass).length;
  return {
    metric: "language_detection_accuracy",
    score: correct / rows.length,
    correct,
    total: rows.length,
    errors: rows.filter((r) => !r.pass),
  };
}

// ── Regresión: extracción de marca (bug "de gasolina" → brand falso) ──────────

function evalBrandExtraction() {
  const rows = BRAND_EXTRACTION_CASES.map((tc) => {
    const predicted = extractBrand(tc.text);
    const pass = predicted === tc.expected_brand;
    return { ...tc, predicted, pass };
  });

  const correct = rows.filter((r) => r.pass).length;
  return {
    metric: "brand_extraction_accuracy",
    score: correct / rows.length,
    correct,
    total: rows.length,
    errors: rows.filter((r) => !r.pass),
  };
}

// ── Helpers de display ────────────────────────────────────────────────────────

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const bar = (v) => {
  const filled = Math.round(v * 20);
  return "█".repeat(filled) + "░".repeat(20 - filled);
};

function printToolResult(r) {
  console.log(`\n  Score:  ${bar(r.score)} ${pct(r.score)}  (${r.correct}/${r.total} correctos)`);
  if (r.errors.length === 0) {
    console.log("  ✅ Sin errores");
  } else {
    console.log(`  ⚠️  ${r.errors.length} error(es):`);
    for (const e of r.errors) {
      console.log(`     [${e.id}] "${e.text}"`);
      console.log(`            esperado=${e.expected}  predicho=${e.predicted}`);
    }
  }
}

function printGuardrailResult(r) {
  const f1 = r.precision + r.recall > 0
    ? (2 * r.precision * r.recall) / (r.precision + r.recall)
    : 0;
  console.log(`\n  Accuracy : ${bar(r.accuracy)}  ${pct(r.accuracy)}`);
  console.log(`  Precision: ${bar(r.precision)}  ${pct(r.precision)}  (de los bloqueados, ¿cuántos eran OOD?)`);
  console.log(`  Recall   : ${bar(r.recall)}  ${pct(r.recall)}  (de los OOD, ¿cuántos se bloquearon?)`);
  console.log(`  F1       : ${bar(f1)}  ${pct(f1)}`);
  console.log(`  Confusión: TP=${r.confusion.tp} TN=${r.confusion.tn} FP=${r.confusion.fp} FN=${r.confusion.fn}`);
  if (r.errors.length === 0) {
    console.log("  ✅ Sin errores");
  } else {
    console.log(`  ⚠️  ${r.errors.length} error(es):`);
    for (const e of r.errors) {
      const tag = e.expected ? "en-ámbito bloqueado" : "fuera-ámbito pasó";
      console.log(`     [${e.id}] (${tag}) "${e.text}"`);
    }
  }
}

// ── Runner principal ──────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║         EVALUACIÓN OFFLINE — Agente TankGo Voz          ║");
console.log("╚══════════════════════════════════════════════════════════╝");

const toolResult      = evalToolSelection();
const guardrailResult = evalGuardrails();
const langResult      = evalLanguageDetection();
const brandResult     = evalBrandExtraction();

console.log("\n─── 1. Precisión en Selección de Herramientas ───────────────");
console.log("    (classifyIntent — sin llamadas API)");
printToolResult(toolResult);

console.log("\n─── 2. Efectividad de los Guardarraíles ─────────────────────");
console.log("    (isInScope — sin llamadas API)");
printGuardrailResult(guardrailResult);

console.log("\n─── 3. Detección de Idioma (regresión) ──────────────────────");
console.log("    (detectLanguageFromText — cubre bug gasolineras/gasoline)");
printToolResult(langResult);

console.log("\n─── 4. Extracción de Marca (regresión) ──────────────────────");
console.log("    (extractBrand — cubre bug 'de gasolina' detectado como marca)");
printToolResult(brandResult);

console.log("\n─── Tasa de Éxito de Tarea (end-to-end) ─────────────────────");
console.log("    Monitorizada en tiempo real vía Langfuse.");
console.log("    Scores emitidos automáticamente por cada llamada al pipeline.");
console.log("    Dashboard: https://cloud.langfuse.com\n");

// ── Escribir JSON para CI ─────────────────────────────────────────────────────

const summary = {
  timestamp: new Date().toISOString(),
  passed: toolResult.score === 1 && guardrailResult.accuracy === 1 && langResult.score === 1 && brandResult.score === 1,
  metrics: {
    tool_selection:    { score: toolResult.score,    correct: toolResult.correct,    total: toolResult.total,    errors: toolResult.errors },
    guardrails:        { accuracy: guardrailResult.accuracy, precision: guardrailResult.precision, recall: guardrailResult.recall, f1: guardrailResult.f1, confusion: guardrailResult.confusion, errors: guardrailResult.errors },
    language_detection:{ score: langResult.score,    correct: langResult.correct,    total: langResult.total,    errors: langResult.errors },
    brand_extraction:  { score: brandResult.score,   correct: brandResult.correct,   total: brandResult.total,   errors: brandResult.errors },
  },
};

writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(summary, null, 2));

export { toolResult, guardrailResult, langResult, brandResult };
