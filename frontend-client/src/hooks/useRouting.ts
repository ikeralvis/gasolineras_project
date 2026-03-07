import { useState, useCallback } from "react";

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

const OSRM_BASE_URL = import.meta.env.VITE_OSRM_URL || "http://localhost:5000";

export function useRouting() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRoute = useCallback(
    async (origin: RouteLocation, destination: RouteLocation): Promise<RoutingResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
        const url = `${OSRM_BASE_URL}/route/v1/driving/${coordinates}?steps=true&geometries=geojson&overview=full`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`OSRM error: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
          throw new Error("No route found");
        }

        const route = data.routes[0];
        const steps: RouteStep[] = [];

        // Procesar pasos
        if (route.legs) {
          route.legs.forEach((leg: any) => {
            if (leg.steps) {
              leg.steps.forEach((step: any) => {
                steps.push({
                  distance: step.distance,
                  duration: step.duration,
                  instruction: step.maneuver?.instruction || "Continue",
                });
              });
            }
          });
        }

        const result: RoutingResult = {
          distance: route.distance,
          duration: route.duration,
          coordinates: route.geometry.coordinates,
          steps,
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
