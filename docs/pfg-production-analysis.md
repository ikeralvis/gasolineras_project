# Analisis funcional y tecnico para evolucion a produccion (PFG)

## 1. Diagnostico actual

Fortalezas:

- Arquitectura modular por microservicios con API Gateway como punto unico de entrada.
- Separacion clara de dominios: usuarios, gasolineras, EV charging, recomendacion, voz y MCP.
- Base tecnica moderna: React + FastAPI + Fastify + Hono + Docker Compose.
- Primeros pasos de IA desacoplada (MCP server y voice assistant con fallback).

Brechas para produccion:

- Sin pipeline CI/CD en GitHub Actions.
- Cobertura de tests parcial y heterogenea por servicio.
- Observabilidad limitada (sin trazabilidad distribuida ni error tracking global).
- Seguridad mejorable en gestion de secretos, politicas de acceso y hardening operativo.
- Despliegue PaaS simple (Render) util para MVP pero limitado para escalado fino y control de costes/SLAs.

## 2. Vision de producto (sin prediccion por ahora)

Objetivo: plataforma de movilidad y energia para conductor final con foco en decision rapida y util.

Capacidades objetivo de esta fase:

- Usuario:
  - perfil, combustible favorito, historico de uso y favoritos inteligentes.
- Gasolineras:
  - busqueda avanzada, detalle enriquecido, comparacion y contexto de ruta.
- EV charging:
  - disponibilidad y precio, filtros por potencia/conector/estado.
- Voice assistant + MCP:
  - consultas naturales con respuesta contextual y accionable.
- Gateway:
  - fachada estable, segura y observable para todos los clientes.

## 3. Es SaaS esta herramienta

Si, puede considerarse SaaS si:

- Se ofrece como servicio online multiusuario.
- Gestiona cuentas/suscripciones o planes (incluso freemium).
- Tiene operacion continua, SLA y soporte.

Hoy estais en estado "SaaS-ready MVP".

Para convertirlo en SaaS solido en el PFG:

- Multi-tenant basico por organizacion o por usuario final (segun enfoque B2B/B2C).
- Planes y limites: rate limit por plan, funciones premium (ruta inteligente, voz avanzada, alertas).
- Facturacion y metrica de uso.
- Backoffice de operacion y soporte.

## 4. Roadmap de mejoras priorizadas (impacto/tiempo)

### Fase A (2-4 semanas) - Produccion base

1. CI/CD minimo viable
- GitHub Actions por servicio:
  - lint + test + build imagen Docker.
  - escaneo de dependencias y contenedor.
- Deploy automatizado a entorno staging.

2. Observabilidad inicial
- Sentry en frontend, gateway y servicios Node/Python.
- Correlation ID por request desde gateway hacia todos los servicios.
- Dashboards basicos (latencia p50/p95, error rate, disponibilidad).

3. Calidad de codigo
- Umbral de coverage minimo por servicio (por ejemplo 60% inicial).
- Contract tests del gateway con servicios internos.
- Smoke e2e de flujos clave (login, busqueda gasolineras, favoritos, mapa).

4. Seguridad esencial
- Secretos en gestor seguro (no en .env local para prod).
- Rotacion de INTERNAL_API_SECRET y JWT.
- Politicas CORS y cookies revisadas para produccion.

### Fase B (4-8 semanas) - Diferenciacion funcional

1. Usuario
- Perfil energetico completo:
  - combustible favorito obligatorio en onboarding.
  - preferencias de ruta (sin peajes, max desvio, estaciones favoritas).
- Historial de consultas y recomendaciones para UX personalizada.

2. Gasolineras
- Comparador de estaciones (top 3) con explicacion clara:
  - precio combustible favorito,
  - distancia,
  - tiempo extra,
  - ahorro estimado.
- Alertas de precio por zona/favoritos.

3. EV Charging
- Filtros avanzados: conector, potencia, operador, disponibilidad.
- Estado en tiempo real cuando el proveedor lo permita.
- Recomendacion mixta ICE/EV segun perfil vehiculo.

4. Voice + MCP
- Catalogo MCP versionado (v1/v2) con contrato estable.
- Tooling conversacional orientado a accion:
  - "llévame a la mejor opcion",
  - "repite solo diesel",
  - "muestrame alternativas con menos desvio".
- Logs de tool-calls y fallback reason para auditoria.

### Fase C (8-12 semanas) - Escalado profesional

1. Plataforma de despliegue
- Salida de Render hacia infraestructura mas controlable:
  - opcion 1: Kubernetes gestionado (AKS/EKS/GKE).
  - opcion 2: ECS/Fargate o Azure Container Apps (menos complejidad operativa).
- Entornos separados: dev, staging, prod.

2. Operacion
- Blue/green o canary deployments.
- Autoscaling por CPU/latencia/cola.
- Backups, DR basico y runbooks de incidentes.

3. Governance
- ADRs (architecture decision records).
- Versionado semantico de APIs y MCP tools.
- Politica de deprecacion de endpoints.

## 5. Recomendaciones por servicio

## 5.1 Gateway

Mejoras:

- Rate limiting por usuario/token y por endpoint critico.
- Cache short-lived en endpoints de lectura intensiva.
- OpenTelemetry + propagacion de trace headers.
- Circuit breakers y timeout policy por upstream.

KPI:

- Latencia p95 por ruta.
- Error rate por servicio destino.

## 5.2 usuarios-service

Mejoras:

- Endpoints de preferencias mas explicitos (combustible, estilo conduccion, sensibilidad precio/tiempo).
- Auditoria de eventos de cuenta (login, cambios perfil, favoritos).
- Hardening auth: refresh token strategy y invalidacion de sesiones.

KPI:

- Conversion onboarding completo.
- Retencion de usuarios activos.

## 5.3 gasolineras-service

Mejoras:

- Politica de frescura de datos configurable por region/hora.
- Precalculo de agregados para stats rapidas.
- Mejora de indices y paginacion para consultas masivas.

KPI:

- Data freshness ratio.
- Tiempo de respuesta en /cerca y /markers.

## 5.4 ev-charging-service

Mejoras:

- Normalizacion de conectores/potencias/operadores.
- Cache de disponibilidad con TTL y marca de antiguedad.
- Filtro de fiabilidad de proveedor.

KPI:

- Porcentaje de puntos con estado actualizado.
- Latencia de busqueda por mapa.

## 5.5 voice-assistant-service

Mejoras:

- Session memory corta por usuario para continuidad conversacional.
- Politica de respuesta breve/accionable por defecto.
- Cost guardrails por usuario (tokens y TTS por dia).

KPI:

- Tiempo medio de respuesta de voz.
- Ratio de consultas resueltas sin repregunta.

## 5.6 mcp-gasolineras-server

Mejoras:

- Versionado y metadata de tools (deprecations, compatibility).
- Contract tests de cada tool contra gateway mock y real staging.
- Politica de errores uniforme (codes + user-facing message).

KPI:

- Tool success rate.
- Fallback rate MCP -> REST.

## 6. Testing strategy recomendada

Piramide de tests:

1. Unit tests (rapidos)
- Utilidades, transformaciones, ranking, validaciones.

2. Integration tests
- Servicio + BD (contenedor efimero).
- Gateway + mocks de servicios.

3. Contract tests
- Contratos JSON entre gateway y microservicios.
- Contratos de tools MCP.

4. E2E tests
- Flujos criticos de usuario en frontend.

Objetivos iniciales:

- Cobertura minima: 60% backend, 50% frontend.
- Flujos e2e: login, filtros, detalle, favoritos, mapa, voz intent nearest.

## 7. CI/CD propuesto (GitHub Actions)

Workflows minimos:

- ci-frontend.yml
  - install, type-check, lint, test, build.
- ci-node-services.yml
  - usuarios, gateway, voice, mcp: lint/test/build image.
- ci-python-services.yml
  - gasolineras, ev-charging: lint, tests, build image.
- security.yml
  - dependency audit + container scan.
- cd-staging.yml
  - despliegue automatico en staging tras merge a main.

## 8. Observabilidad y Sentry

Implantar en 3 capas:

- Frontend:
  - errores JS, performance web vitals, release tracking.
- Gateway:
  - excepciones, latencias, breadcrumbs de upstream.
- Microservicios:
  - errores de negocio, excepciones DB/provider, tags por tenant/usuario anon.

Complementar con:

- Structured logging JSON.
- OpenTelemetry traces.
- Alertas: error rate alto, p95 alto, servicio down.

## 9. Evolucion de plataforma (salir de Render)

Alternativas realistas:

1. Azure Container Apps (recomendado para PFG)
- Muy buena relacion simplicidad/escalado.
- Menos carga operativa que Kubernetes.
- Facil integrar Log Analytics, Key Vault y autoscaling.

2. Kubernetes gestionado (AKS/EKS/GKE)
- Maximo control y narrativa profesional fuerte para TFG.
- Mayor complejidad operativa.

3. ECS/Fargate
- Intermedio en complejidad.

Propuesta para PFG:

- Paso 1: staging en Container Apps o ECS.
- Paso 2: justificar roadmap a Kubernetes como siguiente fase de madurez.

## 10. Propuesta de valor TFG (para destacar)

Narrativa fuerte:

- Plataforma de movilidad energetica inteligente orientada a decisiones en ruta.
- Arquitectura modular cloud-native con gateway, microservicios y capa MCP para IA.
- Enfoque de ingenieria de software real: calidad, seguridad, observabilidad y despliegue continuo.

Diferenciales demo:

- Recomendacion contextual por combustible favorito.
- Voz accionable (consulta -> recomendacion -> navegacion).
- Mapa usable mobile-first con interaccion estilo apps comerciales.

## 11. Backlog priorizado sugerido (top 12)

1. Correlation ID end-to-end en gateway y servicios.
2. Sentry frontend + gateway.
3. GitHub Actions CI base (lint/test/build).
4. Contract tests gateway <-> servicios.
5. Contract tests MCP tools.
6. Onboarding de preferencias de usuario obligatorio.
7. Comparador de estaciones (precio + tiempo + km extra).
8. Alertas de precio en favoritos.
9. EV filtros avanzados (conector/potencia/operador).
10. Dashboard de operacion (latencia/error/frescura datos).
11. Secrets manager y rotacion de secretos.
12. Despliegue staging fuera de Render con IaC basica.

## 12. Conclusion ejecutiva

- El proyecto ya tiene base de arquitectura valida para escalar.
- Con CI/CD, observabilidad, testing y hardening de seguridad, puede defenderse como software casi productivo.
- Si anades modelo de planes y operacion multiusuario, encaja plenamente como SaaS.
- Para el PFG, la combinacion "arquitectura + calidad + UX accionable + IA desacoplada" te da una propuesta muy solida y diferenciada.
