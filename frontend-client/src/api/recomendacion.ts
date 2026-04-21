import { apiFetch } from "./http";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export type CombustibleTipo =
  | "gasolina_95"
  | "gasolina_98"
  | "gasoleo_a"
  | "gasoleo_premium"
  | "glp"
  | "hidrogeno";

type Coord = { lat: number; lon: number; nombre?: string };

export interface RecomendacionRequestPayload {
  origen?: Coord;
  destino?: Coord;
  posicion_actual?: Coord;
  origin?: Coord;
  destination?: Coord;
  current_position?: Coord;
  combustible: CombustibleTipo;
  max_desvio_km?: number;
  max_desvio_min?: number;
  max_detour_minutes?: number;
  max_detour_time?: number;
  top_n?: number;
  peso_precio?: number;
  peso_desvio?: number;
  litros_deposito?: number;
  evitar_peajes?: boolean;
  avoid_tolls?: boolean;
}

export interface RecomendacionResponse {
  ruta_base: {
    distancia_km: number;
    duracion_min: number;
    coordinates: [number, number][];
  };
  recomendaciones: Array<{
    posicion: number;
    gasolinera: {
      id?: string;
      nombre?: string;
      direccion?: string;
      municipio?: string;
      provincia?: string;
      lat: number;
      lon: number;
    };
    precio_litro: number;
    desvio_km: number;
    desvio_min_estimado: number;
    score: number;
    porcentaje_ruta: number;
    ahorro_vs_mas_cara_eur?: number | null;
    distancia_desde_origen_km?: number;
    tipo_acceso?: string | null;
    fuente_tipo_acceso?: string | null;
    confianza_tipo_acceso?: number | null;
  }>;
  opciones_parada?: Array<{
    posicion: number;
    gasolinera: {
      id?: string;
      nombre?: string;
      direccion?: string;
      municipio?: string;
      provincia?: string;
      lat: number;
      lon: number;
    };
    precio_litro: number;
    desvio_km: number;
    desvio_min_estimado: number;
    score: number;
    porcentaje_ruta: number;
    ahorro_vs_mas_cara_eur?: number | null;
    distancia_desde_origen_km?: number;
    tipo_acceso?: string | null;
    fuente_tipo_acceso?: string | null;
    confianza_tipo_acceso?: number | null;
  }>;
  geojson?: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: {
        type: "LineString" | "Point";
        coordinates: [number, number][] | [number, number];
      };
      properties: Record<string, unknown>;
    }>;
  };
  metadata?: {
    detour_strategy?: string;
    detour_minutes_source?: string;
    max_detour_minutes_effective?: number;
    exact_refine_candidates?: number;
    detour_candidates_exact?: number;
    detour_candidates_total_viable?: number;
    detour_exact_required_for_top?: boolean;
    routing_backend?: string;
    avoid_tolls?: boolean;
    [key: string]: unknown;
  };
}

export async function requestRouteRecommendations(
  payload: RecomendacionRequestPayload
): Promise<RecomendacionResponse> {
  const origin = payload.origen ?? payload.origin;
  const destination = payload.destino ?? payload.destination;
  const currentPosition = payload.posicion_actual ?? payload.current_position;
  const maxDetourTime =
    payload.max_desvio_min ?? payload.max_detour_minutes ?? payload.max_detour_time;
  const avoidTolls = payload.evitar_peajes ?? payload.avoid_tolls ?? false;

  const body = {
    ...payload,
    // Spanish contract (legacy-compatible)
    origen: origin,
    destino: destination,
    posicion_actual: currentPosition,
    max_desvio_min: maxDetourTime,
    evitar_peajes: avoidTolls,
    // Gateway contract fields requested by frontend routing UX
    origin,
    destination,
    current_position: currentPosition,
    max_detour_time: maxDetourTime,
    avoid_tolls: avoidTolls,
  };

  const response = await apiFetch(`${API_BASE_URL}/api/recomendacion/ruta`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody?.detail || "No se pudo calcular la ruta");
  }

  return response.json();
}
