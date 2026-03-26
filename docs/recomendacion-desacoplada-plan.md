# Plan de mejora - recomendacion-service desacoplado

## 1) Objetivo de producto

Crear una recomendacion util para viaje en coche que combine:

- Ruta completa desde punto A (ubicacion actual) hasta punto B (destino).
- Gasolineras realmente proximas a la ruta (no solo cercanas en linea recta).
- Precio segun combustible favorito del usuario.
- Impacto real del desvio: kilometros extra y minutos extra.
- Preferencia por opciones practicas (evitar salidas absurdas de autopista).

Resultado UX esperado (simple):

- Opcion recomendada principal.
- 2-3 alternativas.
- Para cada una: precio, distancia extra, tiempo extra, y razon de recomendacion.

## 2) Principios de desacoplo

- El servicio de recomendacion no debe depender de proveedor IA ni frontend.
- Separar en puertos/adaptadores:
  - RoutingProviderPort: calcula ruta y metrica de desvio.
  - StationsProviderPort: consulta estaciones y precios.
  - UserPreferencePort: obtiene combustible favorito y favoritos.
  - RankingPolicyPort: puntua candidatos con reglas de negocio.
- Mantener contratos estables (DTOs) para poder cambiar ORS/OSRM/Mapbox sin tocar el core.
- Evitar llamadas en cascada desde frontend. El frontend solo llama al endpoint agregado.

## 3) Arquitectura propuesta

Capas:

1. API Layer (recomendacion-service)
- Endpoint unico de recomendacion en ruta.
- Endpoint opcional de diagnostico/simulacion de score.

2. Application Layer
- Use case: RecommendStationsOnRouteUseCase.
- Orquesta: ruta base -> candidatos en corredor -> score -> respuesta final.

3. Domain Layer
- Entidades: Route, StationCandidate, UserPreference, Recommendation.
- Politicas: PracticalityPolicy, HighwayExitPenaltyPolicy, PriceDistanceTradeoffPolicy.

4. Infrastructure Layer (adapters)
- Adapter ORS/OSRM para ruta y tiempos.
- Adapter gasolineras-service (snapshot + coordenadas + precios).
- Adapter usuarios-service (combustible favorito + favoritos).

## 4) Flujo funcional A -> B

Paso 1. Obtener perfil de usuario
- combustible_favorito (ej: Precio Gasoleo A).
- favoritos (opcional, para bonus de confianza/afinidad).

Paso 2. Calcular ruta base
- Ruta principal coche A->B.
- Metricas base: km_base, min_base.
- Geometria polyline para pintar mapa.

Paso 3. Generar corredor de ruta
- Buffer geoespacial alrededor de la ruta (ej: 1.5-2.5 km segun tipo de via).
- Filtrar estaciones dentro del corredor.

Paso 4. Calcular desvio real por estacion candidata
- Para cada estacion:
  - Tramo A->estacion + estacion->B.
  - Comparar contra ruta base.
  - Obtener: km_extra y min_extra.
- Si no hay API de matrix, usar lote por bloques para evitar coste alto.

Paso 5. Aplicar reglas de practicidad
- Hard filters (descartar):
  - min_extra > umbral (ej: > 9 min).
  - km_extra > umbral (ej: > 8 km).
- Regla autopista:
  - Penalizar estaciones que exigen salida con retorno largo.
  - Si hay metadata de tipo de via, mayor penalizacion en autopista.

Paso 6. Ranking multi-objetivo
- Score sugerido:
  - 50% precio combustible favorito.
  - 35% min_extra.
  - 15% km_extra.
- Bonus opcional por favorita del usuario.
- Devolver top 3 con explicacion de por que.

## 5) Modelo de score (practico)

Variables normalizadas en [0, 1]:

- price_norm: mejor precio = 0, peor = 1.
- time_norm: menor tiempo extra = 0, mayor = 1.
- km_norm: menor km extra = 0, mayor = 1.

Score final:

score = 0.50 * price_norm + 0.35 * time_norm + 0.15 * km_norm + highway_penalty - favorite_bonus

Interpretacion:

- Menor score = mejor opcion.
- highway_penalty aumenta score si el desvio es poco practico.
- favorite_bonus lo reduce ligeramente si la estacion es favorita.

## 6) Contrato API recomendado

POST /api/recomendaciones/ruta

Input:
- origin: { lat, lon }
- destination: { lat, lon } o texto geocodificado previamente
- userId (opcional) o auth token
- constraints opcionales:
  - maxExtraMinutes
  - maxExtraKm
  - maxCandidates

Output:
- routeBase:
  - distanceKm
  - durationMin
  - geometry
- recommendations: []
  - station
  - preferredFuelField
  - preferredFuelPrice
  - extra:
    - distanceKm
    - durationMin
  - score
  - reasons: []
- alternatives: []
- metadata:
  - providerRouting
  - evaluatedCandidates
  - discardedCandidates

## 7) UX conversacional (sencillo)

Respuesta de voz corta:

- "Te recomiendo Repsol X. Son 2 minutos extra, 1.3 km de desvio, y el gasoleo A esta a 1,46."

Si pide alternativas:

- "Tengo dos opciones mas: una ahorra 2 centimos pero suma 5 minutos; otra es mas rapida pero 3 centimos mas cara."

## 8) Fases de implementacion

Fase 1 - Base desacoplada (1 sprint)
- Introducir puertos/adaptadores en recomendacion-service.
- Endpoint nuevo /ruta con ruta base + candidatos simples por distancia al corredor.
- Sin regla autopista avanzada aun.

Fase 2 - Desvio real y score robusto (1 sprint)
- Calculo A->estacion->B por lotes.
- Score con precio + min_extra + km_extra.
- Integrar combustible favorito del usuario.

Fase 3 - Practicidad autopista + observabilidad (1 sprint)
- Penalizacion avanzada de salidas no practicas.
- Telemetria por razon de descarte y score.
- AB testing de pesos de ranking.

## 9) Riesgos y mitigaciones

- Coste/latencia de routing por candidato.
  - Mitigar con prefiltrado por corredor y procesamiento por lotes.
- Inconsistencias de precios o campos vacios.
  - Mitigar con fallback de combustible y validacion de datos.
- Falta de metadatos de via (autopista/local).
  - Empezar con heuristica de tiempo extra y luego enriquecer.

## 10) KPIs

- Tasa de aceptacion de recomendacion principal.
- Minutos extra promedio de opcion elegida.
- Ahorro medio por litro vs ruta base sin desvio.
- Tiempo de respuesta p50/p95 del endpoint /ruta.
- Porcentaje de recomendaciones descartadas por no practicidad.
