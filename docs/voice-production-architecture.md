# Voice AI Production Architecture (Cloud Run)

Fecha: 2026-04-11

## 1. Root Cause Real del fallo WSS

1. El navegador intentaba abrir WS directo a `wss://.../ws/voice` sin pasar por el Gateway.
2. `voice-assistant-service` es privado con IAM en Cloud Run; el browser no puede adjuntar un ID token de servicio para el handshake WS.
3. El Gateway no tenia endpoint WS propio (`/api/voice/ws`), solo proxy HTTP (`/api/voice/dialog`).
4. El frontend construia por defecto WS en `/ws/voice` del host publico, ruta inexistente en el Gateway.
5. Resultado: fallo de handshake WS y fallback HTTP.

## 2. Decision Arquitectonica (Option A)

Se implementa **WSS end-to-end para el cliente** via Gateway:

- Frontend abre `wss://<gateway>/api/voice/ws`.
- Gateway termina WS publico y abre WS saliente a Voice privado (`/ws/voice`).
- Gateway adjunta `X-Serverless-Authorization: Bearer <ID_TOKEN_SA>` para pasar IAM de Cloud Run.

Esto mantiene Voice privado y evita acceso directo desde frontend.

## 3. Arquitectura Final

```text
Frontend (Public Cloud Run)
  -> WSS /api/voice/ws + HTTPS /api/*
Gateway (Public Cloud Run)
  -> WSS bridge -> Voice (Private Cloud Run, IAM)
  -> HTTPS -> Gasolineras service (internal/public as configured)
Voice (Private Cloud Run, IAM)
  -> Tool call: get_prices -> Gateway /api/gasolineras/cerca
  -> LLM (Gemini Live/Dialog)
  -> TTS (Gemini TTS fallback)
```

## 4. Flujo de autenticacion

### Cliente -> Gateway

- Cookie de sesion/JWT del usuario (existente en proyecto).
- El frontend no envia tokens de servicio.

### Gateway -> Voice privado

- Gateway obtiene ID token desde metadata server (audiencia = origin de Voice).
- En WS y HTTP envia `X-Serverless-Authorization`.
- Para contexto de usuario, Gateway propaga `X-User-Authorization: Bearer <authToken>` cuando exista.

### Voice

- Acepta token de usuario desde `X-User-Authorization` o `Authorization`.
- Nunca expone endpoint publico sin Gateway.

## 5. Tool-calling sin alucinaciones de precios

Contrato definido para `get_prices`:

### Tool request

```json
{
  "name": "get_prices",
  "args": {
    "lat": 40.41,
    "lon": -3.70,
    "km": 8,
    "fuel": "gasolina95",
    "limit": 5
  }
}
```

### Tool response

```json
{
  "ok": true,
  "fuel": "gasolina95",
  "km": 8,
  "total": 5,
  "stations": [
    {
      "name": "ESTACION X",
      "municipality": "Madrid",
      "distanceKm": 1.2,
      "prices": {
        "gasolina95": 1.529,
        "gasolina98": 1.689,
        "gasoleoA": 1.479,
        "gasoleoPremium": 1.559
      }
    }
  ]
}
```

### Guardrail implementado

- Si la intencion del usuario es de precios, la respuesta final se fuerza a formato **tool-grounded**.
- Si no hay salida de herramienta o falta ubicacion, se responde sin inventar importes.

## 6. TTS fix (audio-disabled)

Causa principal observada:

- En fallback HTTP, si `includeAudio` no llegaba correctamente o no habia texto final, se devolvia `audio-disabled` y `audioBase64: null`.

Cambios implementados:

1. `includeAudio` se preserva en flujo WS+HTTP por Gateway.
2. Se normaliza semantica TTS en backend:
   - `audio-disabled`: solo cuando `includeAudio=false`.
   - `no-text-for-tts`: no habia texto util para sintetizar.
   - `tts-fallback-failed:*`: fallo real de TTS.
3. Frontend ahora informa explicitamente cuando no llega audio, en lugar de aparentar reproduccion.

## 7. Cambios de codigo aplicados

- `gateway-hono/src/index.js`
  - Nuevo WS bridge publico en `/api/voice/ws`.
  - Upgrade handler + proxy WS saliente a Voice.
  - Inyeccion IAM token para Cloud Run privado.
  - Propagacion opcional de token usuario (`X-User-Authorization`).
- `gateway-hono/src/modules/cloudRunAuthFetch.js`
  - Nuevo helper exportado `getCloudRunIdTokenForUrl()`.
- `gateway-hono/package.json`
  - Dependencia `ws`.
- `frontend-client/src/api/voiceAssistant.ts`
  - WS por defecto cambiado a `/api/voice/ws` (gateway-only).
- `frontend-client/src/components/VoiceAssistantWidget.tsx`
  - UX de fallback audio corregida.
- `voice-assistant-service/src/core/network.js`
  - Lectura de auth token desde headers propagados por Gateway.
- `voice-assistant-service/src/server.js`
  - Uso de parser multi-header para auth.
- `voice-assistant-service/src/adapters/geminiNativeDialog.js`
  - Guardrails tool-grounded para consultas de precios.
  - TTS helper con notas explicitas.

## 8. Cambios Cloud Run (pasos accionables)

1. Asegura IAM invoker de Gateway sobre Voice:

```bash
gcloud run services add-iam-policy-binding voice-assistant-service \
  --region=europe-west1 \
  --member=serviceAccount:<GATEWAY_RUNTIME_SA> \
  --role=roles/run.invoker
```

2. Despliega Voice privado (sin `--allow-unauthenticated`).

3. Despliega Gateway publico con envs:

```bash
VOICE_ASSISTANT_SERVICE_URL=https://voice-assistant-service-<hash>-ew.a.run.app
CLOUD_RUN_SERVICE_AUTH_ENABLED=true
FRONTEND_URL=https://<frontend-domain>
FRONTEND_URLS=https://<frontend-domain>
VOICE_WS_CONNECT_TIMEOUT_MS=10000
```

4. Frontend en produccion:

```bash
VITE_API_BASE_URL=https://<gateway-domain>
```

5. No configurar frontend para llamar directo a Voice privado.

## 9. Verificacion de salida

1. Browser DevTools:
   - WS conectado en `/api/voice/ws` con estado 101.
2. Voice logs:
   - conexiones entrantes via Gateway, sin 401 IAM.
3. Flujo live:
   - `includeAudio=true` -> `tts.note=ok` + `audioBase64` no nulo.
4. Consulta de precios:
   - respuesta textual con importes de `toolOutputs`.
   - sin precios cuando no hay salida de herramienta.

## 10. Siguiente mejora recomendada

Si se quiere latencia aun menor para audio continuo:

- Mantener WS actual para turnos.
- Añadir canal opcional SSE para eventos parciales de transcripcion/estado sin romper compatibilidad.
