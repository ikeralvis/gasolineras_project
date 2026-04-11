# Frontend CORS y Safari 401: Solucion aplicada

## Resumen
Se reforzo el frontend para que todas las llamadas al backend que dependen de sesion envien cookies de forma consistente, especialmente en Safari:

- Se centralizo `fetch` en `frontend-client/src/api/http.ts`.
- El helper fuerza `credentials: "include"` en todas las peticiones.
- Las APIs clave de mapas/ruta/historico se migraron a este helper.
- Se actualizaron llamadas directas en drawers de mapa para enviar sesion.

## Cambios concretos

1. Cliente HTTP unificado:
- Archivo: `frontend-client/src/api/http.ts`
- Funciones: `apiFetch`, `apiFetchJson`
- Comportamiento: `credentials: "include"` + `Content-Type` JSON automatico cuando aplica.

2. Endpoints migrados a `apiFetch`:
- `frontend-client/src/api/charging.ts`
- `frontend-client/src/api/gasolineras.ts`
- `frontend-client/src/api/recomendacion.ts`
- `frontend-client/src/hooks/useRouting.ts`

3. Correccion de historico:
- `getHistorialPrecios` ahora envia cookies de sesion.
- Esto evita 401 silenciosos cuando el backend protege endpoints por cookie.

## Requisitos backend para evitar 401 en Safari
Safari es mas estricto con cookies cross-site. Debe cumplirse todo esto:

1. CORS
- `Access-Control-Allow-Origin` con origen explicito (no `*`).
- `Access-Control-Allow-Credentials: true`.
- Permitir metodos/headers usados por frontend.

2. Cookies
- Cookie de sesion con `SameSite=None; Secure` en entornos HTTPS cross-site.
- Dominio coherente entre frontend y auth (ideal: mismo dominio o subdominio comun).

3. Infra
- Front y backend por HTTPS.
- Evitar mezclar dominios incompatibles para login y API (reduce bloqueos ITP de Safari).

## Checklist rapido de validacion

1. Login Google completa sin 401 en Safari.
2. `GET /api/usuarios/me` responde 200 con cookie de sesion.
3. Historico (`/api/gasolineras/:id/historial`) carga datos en sesion activa.
4. Recomendacion/routing mantiene sesion cuando el backend la requiere.
