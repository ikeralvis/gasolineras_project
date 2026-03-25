# Plan de Implementación MCP + Voz (Desacoplado)

## Objetivo

Crear una capa de herramientas IA independiente del core de microservicios para:

- exponer capacidades vía MCP,
- habilitar asistente conversacional/voz,
- mantener independencia operativa y de despliegue.

## Arquitectura objetivo

1. `mcp-gasolineras-server`
- Expone tools MCP semánticas.
- Consume gateway como fuente de verdad.
- Provee descubrimiento de infraestructura (`discover_infra`).

2. `voice-assistant-service`
- Orquesta intención -> tools -> respuesta apta para voz.
- Adaptadores por proveedor (Gemini/Whisper/TTS).
- Puede operar con REST bridge hoy y migrar a cliente MCP completo después.

3. Microservicios existentes
- Se mantienen sin acoplarse al proveedor IA.

## Fases

### Fase 1 - Base técnica (MVP)
- [x] Crear MCP server con tools esenciales.
- [x] Crear servicio de voz desacoplado.
- [x] Preparar variables de entorno y documentación.

### Fase 2 - Integración IA real
- [ ] Implementar transcripción Whisper (`/voice/transcribe`).
- [ ] Activar generación Gemini Flash con políticas de prompt y guardrails.
- [ ] Activar síntesis TTS (ElevenLabs/OpenAI) y streaming de audio.

### Fase 3 - Tooling avanzado
- [ ] Añadir tools de negocio: más barata por combustible, abierta ahora, en ruta.
- [ ] Añadir fallback MCP->REST y circuit-breakers.
- [ ] Trazabilidad con logs de tool-calls por requestId.

### Fase 4 - Calidad y seguridad
- [ ] Tests contractuales de tools MCP.
- [ ] Tests e2e de intención de voz.
- [ ] Rate limiting, auth de servicios internos y policy de costes.

## Plan de pruebas

## 1) Smoke MCP

- Ejecutar server MCP y probar:
  - `get_snapshot_status`
  - `find_nearest_station`
  - `find_cheapest_nearby`
  - `discover_infra`

Criterio: respuestas estructuradas y sin excepción.

## 2) Smoke voz

- POST `/voice/intent` con texto "dime la más cercana" y coordenadas.
- Verificar:
  - `intent=nearest`
  - toolResult con estación
  - answer textual apta para TTS

## 3) Pruebas de regresión

- Caída temporal gateway: respuesta controlada 5xx con mensaje claro.
- Falta API keys: fallback funcional sin romper endpoint.

## Métricas recomendadas

- Latencia p50/p95 por tool.
- Tasa de errores por proveedor IA.
- Tiempo de resolución de intención a respuesta final.
- Porcentaje de respuestas con datos frescos (snapshot vigente).

## Recomendación de despliegue

- Deploy independiente de ambos servicios.
- Versionado semántico de tools MCP.
- Entorno staging con coste limitado para pruebas de voz.
