# Voice Assistant Service

Servicio de voz desacoplado para investigación y despliegue empresarial.

## Objetivo

- Recibir una intención de voz/texto.
- Resolverla con tools internas (vía MCP o REST bridge).
- Devolver respuesta textual y payload estructurado listo para TTS.

## Endpoints MVP

- `POST /voice/transcribe`: STT con Whisper (audioBase64 -> texto).
- `POST /voice/intent`: routing de intención + tools + respuesta + TTS opcional.
- `GET /health`: estado del servicio.

## Estrategia de desacoplo

- Adaptadores por proveedor (`src/adapters`).
- No acoplar reglas de negocio al proveedor de IA.
- Mantener interfaz de tool estable para migrar REST->MCP sin romper consumidores.

## Variables

Ver `.env.example`.

Guardrails recomendados para controlar coste:

- `VOICE_RATE_LIMIT_WINDOW_MS`: ventana de rate limit.
- `VOICE_RATE_LIMIT_MAX_REQUESTS`: máximo peticiones por IP en la ventana.
- `VOICE_MAX_TEXT_CHARS`: tamaño máximo de texto de entrada.
- `VOICE_MAX_AUDIO_BASE64_CHARS`: tamaño máximo de audio base64.
- `VOICE_MAX_KM`: radio máximo permitido para consultas cercanas.
- `VOICE_ENABLE_TTS_AUDIO`: permite desactivar generación de audio para ahorrar coste.
- `OPENAI_TIMEOUT_MS`: timeout de llamadas a OpenAI.
- `OPENAI_ROUTER_MAX_TOKENS`: tope de tokens para clasificación de intención.
- `OPENAI_LLM_MAX_TOKENS`: tope de tokens para respuesta final.

## Configuración en OpenAI (paso a paso)

1. Crea cuenta y proyecto en OpenAI Platform.
2. Ve a `API keys` y crea una secret key.
3. Activa billing y define un hard limit mensual bajo para controlar coste.
4. Copia la key en `OPENAI_API_KEY`.
5. Mantén:
	 - `OPENAI_STT_MODEL=whisper-1`
	 - `OPENAI_ROUTER_MODEL=gpt-4o-mini`
	 - `OPENAI_LLM_MODEL=gpt-4o-mini`
	 - `OPENAI_TTS_MODEL=gpt-4o-mini-tts`

El Playground sirve para pruebas manuales de prompts, pero la configuración real de API key y facturación se hace en OpenAI Platform.

## Ejemplos de uso

### 1) Transcribir audio

```bash
curl -X POST http://localhost:8090/voice/transcribe \
	-H "Content-Type: application/json" \
	-d '{
		"audioBase64": "<base64>",
		"mimeType": "audio/webm",
		"language": "es"
	}'
```

### 2) Resolver intención con audio opcional

```bash
curl -X POST http://localhost:8090/voice/intent \
	-H "Content-Type: application/json" \
	-d '{
		"text": "dime la más cercana",
		"location": {"lat": 40.4168, "lon": -3.7038, "km": 8},
		"includeAudio": false
	}'
```
