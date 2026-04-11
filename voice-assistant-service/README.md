# Voice Assistant Service (Google Gemini Native Audio Dialog)

Microservicio lean de voz en tiempo real para TankGo, 100% Google (AI Studio + Gemini).

## Objetivo

- Recibir audio o texto por WebSocket.
- Enviar el turno directamente a Gemini Native Audio Dialog.
- Devolver texto y audio en una sola respuesta.

No usa pipeline STT -> LLM -> TTS separado.

## Endpoints

- GET /health
- GET /capabilities
- POST /voice/dialog
- GET /ws/voice

### POST /voice/dialog

Alternativa HTTP al transporte WebSocket, util para entornos con Cloud Run privado en IAM
cuando el navegador no puede abrir WS directo al servicio.

Body (JSON):
{
  "text": "dime la mas cercana",
  "includeAudio": false,
  "location": { "lat": 40.41, "lon": -3.70, "km": 8 }
}

## Protocolo WebSocket

URL:

ws://localhost:8090/ws/voice

Eventos al conectar:
- ready
- server-ping (keepalive del servidor)

Acciones de cliente:

1) dialog
Solicitud:
{
  "id": "req-1",
  "action": "dialog",
  "payload": {
    "audioBase64": "...",
    "mimeType": "audio/webm",
    "includeAudio": true,
    "location": { "lat": 40.41, "lon": -3.70, "km": 8 }
  }
}

Tambien admite texto:
{
  "id": "req-2",
  "action": "dialog",
  "payload": {
    "text": "dime la mas cercana",
    "includeAudio": false
  }
}

2) audio_chunk
- Acumula chunks de audio en buffer de sesion.

3) audio_commit
- Fusiona los chunks acumulados y ejecuta un turno Gemini.

4) clear_buffer
- Limpia buffer de stream.

5) ping
- Health de sesion.

Respuesta estandar:
{
  "type": "response",
  "id": "req-1",
  "action": "dialog",
  "ok": true,
  "data": {
    "provider": "google-ai-studio-gemini",
    "model": "gemini-2.5-flash-preview-native-audio-dialog",
    "answer": { "text": "..." },
    "tts": { "audioBase64": "...", "mimeType": "audio/wav" }
  }
}

## Variables

Ver .env.example.

Variables clave:
- GOOGLE_API_KEY (o GEMINI_API_KEY)
- GEMINI_MODEL
- GEMINI_VOICE_NAME
- GEMINI_LANGUAGE

Contexto opcional de gasolineras:
- VOICE_ENABLE_GAS_CONTEXT=true
- GATEWAY_BASE_URL=http://gateway:8080

## Dependencias

- fastify
- @fastify/cors
- @fastify/websocket
- @google/genai

## Desarrollo

npm install
npm run start

## Cloud Run

Recomendado para WebSocket:
- timeout >= 900
- concurrency 10-20
- keepalive cliente y servidor cada 20-30s
