# Voice Assistant Service

Servicio de voz desacoplado para investigación y despliegue empresarial.

## Objetivo

- Recibir una intención de voz/texto.
- Resolverla con tools internas (vía MCP o REST bridge).
- Devolver respuesta textual y payload estructurado listo para TTS.

## Endpoints MVP

- `GET /ws/voice`: canal WebSocket para `transcribe` e `intent` (nuevo transporte recomendado).
- `GET /health`: estado del servicio.

## Protocolo WebSocket (Fase 1)

URL:

```text
ws://localhost:8090/ws/voice
```

Al conectar, el servidor envia un evento `ready`.

Peticiones del cliente:

```json
{
	"id": "req-1",
	"action": "transcribe",
	"payload": {
		"audioBase64": "...",
		"mimeType": "audio/webm",
		"language": "es"
	}
}
```

```json
{
	"id": "req-2",
	"action": "intent",
	"payload": {
		"text": "dime la mas cercana",
		"location": { "lat": 40.4168, "lon": -3.7038, "km": 8 },
		"includeAudio": true
	}
}
```

Respuesta estandar:

```json
{
	"type": "response",
	"id": "req-2",
	"action": "intent",
	"ok": true,
	"data": { "intent": "nearest", "answer": { "text": "..." }, "tts": { "audioBase64": "..." } }
}
```

Respuesta de error:

```json
{
	"type": "response",
	"id": "req-2",
	"action": "intent",
	"ok": false,
	"statusCode": 400,
	"error": "km-out-of-range",
	"message": "km-out-of-range"
}
```

## Estrategia de desacoplo

- Adaptadores por proveedor (`src/adapters`).
- No acoplar reglas de negocio al proveedor de IA.
- Mantener interfaz de tool estable para migrar REST->MCP sin romper consumidores.

## Variables

Ver `.env.example`.

Estrategia MCP/REST en runtime:

- `MCP_GATEWAY_MODE=mcp-first`: intenta tools MCP y si falla usa gateway REST.
- `MCP_GATEWAY_MODE=rest`: usa solo gateway REST.
- `MCP_GATEWAY_MODE=mcp-only`: falla si MCP no responde.
- `MCP_SERVER_COMMAND` y `MCP_SERVER_ARGS`: comando para levantar/conectar cliente MCP por stdio.

Guardrails recomendados para controlar coste:

- `VOICE_RATE_LIMIT_WINDOW_MS`: ventana de rate limit.
- `VOICE_RATE_LIMIT_MAX_REQUESTS`: máximo peticiones por IP en la ventana.
- `VOICE_MAX_TEXT_CHARS`: tamaño máximo de texto de entrada.
- `VOICE_MAX_AUDIO_BASE64_CHARS`: tamaño máximo de audio base64.
- `VOICE_MAX_KM`: radio máximo permitido para consultas cercanas.
- `VOICE_ENABLE_TTS_AUDIO`: permite desactivar generación de audio para ahorrar coste.
- `VOICE_ALLOWED_ORIGINS`: lista CSV de orígenes permitidos para WS (por defecto `*`).
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

## Uso recomendado

Consumir siempre por WebSocket con acciones `transcribe` e `intent`.
Los endpoints HTTP legacy fueron retirados para mantener un único transporte.
