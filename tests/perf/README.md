# Performance Smoke (k6)

Objetivo: medir latencia p95 y tasa de error en endpoints clave con carga ligera.

## Requisitos
- k6 instalado localmente.

## Gateway (health)
```
BASE_URL=http://localhost:8080 PATH=/health k6 run tests/perf/k6-gateway-smoke.js
```

## Ajustes rapidos
```
VUS=3 DURATION=45s BASE_URL=http://localhost:8080 PATH=/api/gasolineras k6 run tests/perf/k6-gateway-smoke.js
```

## Evidencias para el PFG
- Captura del resumen de k6 con p95 y tasa de error.
- Anotar hardware/entorno (local o Cloud Run) y fecha.
