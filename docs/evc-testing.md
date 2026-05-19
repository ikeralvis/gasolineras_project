# EVC - Estrategia de Visualizacion de Calidad

Esta estrategia deja evidencias visuales y medibles de calidad: cobertura, estabilidad, UX y rendimiento.

## 1) SonarCloud (ya configurado)
- Evidencia: grafico de burbujas (Maintainability, Reliability, Security) + cobertura.
- Uso: capturas del panel de proyecto.

## 2) Unit e Integracion (por servicio)
- Frontend: Vitest con cobertura.
  - `npm run test:coverage`
- Usuarios (Node): Vitest con cobertura.
  - `npm run test:coverage`
- Gasolineras (Python): pytest.
  - `pytest -v`

Evidencias:
- HTML/LCOV de cobertura y resumen de tests.

## 3) E2E / UX con Playwright
Ubicacion: `frontend-client/tests/e2e`.

Comandos:
- `npm run test:e2e`
- `npm run test:e2e:report`

Instalacion de navegadores (una vez):
- `npx playwright install`

Evidencias:
- Reporte HTML con screenshots de los casos principales.

## 4) Rendimiento ligero (k6)
Ubicacion: `tests/perf`.

Ejemplo:
```
BASE_URL=http://localhost:8080 PATH=/health k6 run tests/perf/k6-gateway-smoke.js
```

Evidencias:
- p95 de latencia y tasa de error.
- Captura del resumen de k6.

## 5) Acceptance (no codigo)
- Checklist funcional (login, busqueda de gasolineras, filtros, mapa).
- Mini cuestionario UX (SUS o 5 preguntas breves).

## 6) Lighthouse (a cargo del equipo)
- Evidencia: scores de Performance/Accessibility/SEO.

## Resultado final (para memoria)
- Cobertura y calidad estatica (SonarCloud).
- Pruebas automatizadas (unit, integracion, e2e).
- Rendimiento medido con p95 (k6).
- UX validada con reportes y cuestionario.
