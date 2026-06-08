/**
 * Dataset de evaluación del agente de voz TankGo.
 * - TOOL_CASES: ground-truth para Precisión en Selección de Herramientas
 * - GUARDRAIL_CASES: ground-truth para Efectividad de los Guardarraíles
 */

export const MOCK_LOCATION = { lat: 43.263, lon: -2.935, km: 8 }; // Bilbao

// ── Métrica 1: Selección de Herramientas ─────────────────────────────────────
// expected: "prices" → get_prices | "nearest" → get_nearest_stations | "unknown"
export const TOOL_CASES = [
  // Precio → "prices"
  { id: "P01", text: "¿Cuánto cuesta la gasolina 95?",        expected: "prices" },
  { id: "P02", text: "Busca la más barata cerca",             expected: "prices" },
  { id: "P03", text: "¿Dónde está más barata la gasolina?",  expected: "prices" },
  { id: "P04", text: "Precio del diésel ahora mismo",         expected: "prices" },
  { id: "P05", text: "¿Cuál es la gasolina más económica?",   expected: "prices" },
  { id: "P06", text: "¿Cuesta mucho el gasoleo A aquí?",      expected: "prices" },
  { id: "P07", text: "¿Gasolina 98 barata cerca?",            expected: "prices" },
  { id: "P08", text: "Where is gasoline cheapest near me?",   expected: "prices" },

  // Proximidad → "nearest"
  { id: "N01", text: "¿Qué gasolinera tengo más cerca?",      expected: "nearest" },
  { id: "N02", text: "Gasolinera más próxima",                expected: "nearest" },
  { id: "N03", text: "¿Hay alguna gasolinera cerca de aquí?", expected: "nearest" },
  { id: "N04", text: "Find the nearest gas station",          expected: "nearest" },
  { id: "N05", text: "¿Cuál está más cerca?",                 expected: "nearest" },
  { id: "N06", text: "Quiero la gasolinera más cercana",      expected: "nearest" },
  { id: "N07", text: "¿Dónde hay una gasolinera cerca?",      expected: "nearest" },
  { id: "N08", text: "Non dago hurbilen dagoen gasolindegi",  expected: "nearest" },

  // Sin intención clara → "unknown" (LLM decide)
  { id: "U01", text: "Hola, buenos días",                     expected: "unknown" },
  { id: "U02", text: "Gracias por la info",                   expected: "unknown" },
  { id: "U03", text: "Vale, perfecto",                        expected: "unknown" },
];

// ── Detección de idioma (regresión) ──────────────────────────────────────────
// Cubre el bug: "gasolineras" contiene "gasoline" → detectaba en-US incorrectamente.
// expected: "es" | "en" | "eu"
export const LANGUAGE_CASES = [
  // Español — deben detectarse como "es"
  { id: "L_ES_01", text: "¿Qué gasolineras hay cerca de mí?",  expected: "es" }, // bug original
  { id: "L_ES_02", text: "¿Cuánto cuesta la gasolina 95?",     expected: "es" },
  { id: "L_ES_03", text: "Gasolinera más cercana",             expected: "es" },
  { id: "L_ES_04", text: "Precio del combustible",             expected: "es" },
  { id: "L_ES_05", text: "¿Dónde repostar?",                   expected: "es" },
  { id: "L_ES_06", text: "Mapa de gasolineras",                expected: "es" }, // "mapa" contiene "map"
  { id: "L_ES_07", text: "Rutas con gasolineras",              expected: "es" },
  { id: "L_ES_08", text: "Precio del gasoleo",                 expected: "es" },

  // Inglés — deben detectarse como "en"
  { id: "L_EN_01", text: "Find the nearest gas station",        expected: "en" },
  { id: "L_EN_02", text: "Where is the cheapest gasoline?",     expected: "en" },
  { id: "L_EN_03", text: "What is the price of diesel?",        expected: "en" },
  { id: "L_EN_04", text: "Show me the nearest petrol station",  expected: "en" },

  // Euskera — deben detectarse como "eu"
  { id: "L_EU_01", text: "Non dago hurbilen dagoen gasolindegi?", expected: "eu" },
  { id: "L_EU_02", text: "Kaixo, erregai prezio",               expected: "eu" },
];

// ── Métrica 2: Guardarraíles ──────────────────────────────────────────────────
// expected_in_scope: true → debe pasar | false → debe bloquearse
export const GUARDRAIL_CASES = [
  // En ámbito (deben pasar)
  { id: "IN_01", text: "¿Cuánto cuesta la gasolina 95?",        expected_in_scope: true },
  { id: "IN_02", text: "Gasolinera más cercana",                expected_in_scope: true },
  { id: "IN_03", text: "¿Dónde repostar más barato?",           expected_in_scope: true },
  { id: "IN_04", text: "Precio del diésel cerca",               expected_in_scope: true },
  { id: "IN_05", text: "Hola",                                  expected_in_scope: true },
  { id: "IN_06", text: "Gracias",                               expected_in_scope: true },
  { id: "IN_07", text: "Rutas con gasolineras en TankGo",       expected_in_scope: true },
  { id: "IN_08", text: "¿Qué combustible está más barato?",     expected_in_scope: true },
  { id: "IN_09", text: "¿Dónde hay recarga eléctrica cerca?",   expected_in_scope: true },
  { id: "IN_10", text: "Find cheap petrol near me",             expected_in_scope: true },

  // Fuera de ámbito (deben bloquearse)
  { id: "OUT_01", text: "¿Cómo se hace una paella?",             expected_in_scope: false },
  { id: "OUT_02", text: "¿Cuál es la capital de Francia?",       expected_in_scope: false },
  { id: "OUT_03", text: "Escríbeme un poema sobre el mar",       expected_in_scope: false },
  { id: "OUT_04", text: "¿Qué tiempo hace mañana en Madrid?",    expected_in_scope: false },
  { id: "OUT_05", text: "Recomiéndame una película de terror",   expected_in_scope: false },
  { id: "OUT_06", text: "¿Cómo funciona la inteligencia artificial?", expected_in_scope: false },
  { id: "OUT_07", text: "Háblame de historia de España",         expected_in_scope: false },
  { id: "OUT_08", text: "¿Cuál es el mejor restaurante de Bilbao?", expected_in_scope: false },
  { id: "OUT_09", text: "Tradúceme esto al inglés",              expected_in_scope: false },
  { id: "OUT_10", text: "¿Qué partido ganó las elecciones?",     expected_in_scope: false },
];
