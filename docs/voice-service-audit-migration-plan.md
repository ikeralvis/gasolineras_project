# Migracion Completada: Servicio de Voz 100% Google Gemini

Fecha: 2026-04-11

## Estado final

El microservicio de voz ya no tiene ninguna dependencia funcional de OpenAI.

Arquitectura actual:
- Transporte: WebSocket
- Modelo: Gemini Native Audio Dialog en Google AI Studio API
- Flujo: audio/texto de entrada -> Gemini -> texto + audio de salida
- Contexto de negocio: opcional, desde gateway de gasolineras

## Cambios aplicados

1. Eliminacion total de OpenAI:
- Borrados adapters y handlers de STT/LLM/TTS OpenAI.
- Eliminadas variables OPENAI_* del microservicio.
- Eliminado uso de fallback de proveedores.

2. Gemini Native Audio Dialog:
- Nuevo adapter de dialogo nativo:
  - src/adapters/geminiNativeDialog.js
- Soporte de turnos directos:
  - action dialog
- Soporte de streaming por chunks:
  - action audio_chunk
  - action audio_commit
  - action clear_buffer

3. Configuracion lean:
- Nuevo entorno solo Google en .env.example.
- Nuevo config central en src/config/env.js.

4. Simplificacion de servidor:
- Handler WS mas corto y directo.
- Sin pipeline secuencial STT -> LLM -> TTS.

5. Dependencias:
- Solo SDK oficial Google para IA: @google/genai.
- Sin librerias OpenAI.

## Acciones WebSocket

- ping
- dialog
- audio_chunk
- audio_commit
- clear_buffer

## Variables clave

- GOOGLE_API_KEY (o GEMINI_API_KEY)
- GEMINI_MODEL
- GEMINI_VOICE_NAME
- GEMINI_LANGUAGE

Opcionales:
- VOICE_ENABLE_GAS_CONTEXT
- GATEWAY_BASE_URL

## Mapeo a limites Google AI Studio mostrados

Objetivo operativo recomendado:
- Preferir Gemini 2.5 Flash Native Audio Dialog para modo voz continuo.
- Usar ventanas cortas de turno y commit rapido para reducir latencia percibida.
- Mantener keepalive WS cada 20-30s para estabilidad de sesiones largas.

## Siguientes mejoras tecnicas recomendadas

1. Migrar envio de audio a Opus binario (evitar base64 para menor overhead).
2. Activar canary de GEMINI_MODEL para probar Gemini 3 Flash Live por cohortes.
3. Anadir metricas p50/p95 por accion dialog y audio_commit.
