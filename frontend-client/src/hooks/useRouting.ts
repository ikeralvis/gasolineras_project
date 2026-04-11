import { useState, useCallback } from "react";
import { apiFetch } from "../api/http";

export interface RouteLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface RouteStep {
  distance: number; // en metros
  duration: number; // en segundos
  instruction: string;
}

export interface RoutingResult {
  distance: number; // en metros
  duration: number; // en segundos
  coordinates: [number, number][]; // [lng, lat]
  steps: RouteStep[];
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export function useRouting() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRoute = useCallback(
    async (
      origin: RouteLocation,
      destination: RouteLocation,
      opts?: { avoidTolls?: boolean; maxDetourTime?: number }
    ): Promise<RoutingResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiFetch(`${API_BASE_URL}/api/routing/directions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            coordinates: [
              [origin.lng, origin.lat],
              [destination.lng, destination.lat],
            ],
            origin: { lat: origin.lat, lon: origin.lng, nombre: origin.name },
            destination: { lat: destination.lat, lon: destination.lng, nombre: destination.name },
            avoid_tolls: !!opts?.avoidTolls,
            max_detour_time: opts?.maxDetourTime,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody?.detail || `Routing error: ${response.statusText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data.coordinates) || data.coordinates.length === 0) {
          throw new Error("No route found");
        }

        const result: RoutingResult = {
          distance: data.distance_m,
          duration: data.duration_s,
          coordinates: data.coordinates,
          steps: [],
        };

        setLoading(false);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error calculating route";
        setError(errorMessage);
        setLoading(false);
        return null;
      }
    },
    []
  );

  return { getRoute, loading, error };
}
