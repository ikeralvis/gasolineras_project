const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export type CombustibleTipo =
  | "gasolina_95"
  | "gasolina_98"
  | "gasoleo_a"
  | "gasoleo_premium"
  | "glp"
  | "hidrogeno";

export interface RecomendacionRequestPayload {
  origen: { lat: number; lon: number; nombre?: string };
  destino: { lat: number; lon: number; nombre?: string };
  combustible: CombustibleTipo;
  max_desvio_km?: number;
  top_n?: number;
  peso_precio?: number;
  peso_desvio?: number;
  litros_deposito?: number;
  evitar_peajes?: boolean;
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
  }>;
}

export async function requestRouteRecommendations(
  payload: RecomendacionRequestPayload
): Promise<RecomendacionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/recomendacion/ruta`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody?.detail || "No se pudo calcular la ruta");
  }

  return response.json();
}
