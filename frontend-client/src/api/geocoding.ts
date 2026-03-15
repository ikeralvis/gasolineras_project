const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export interface GeocodingLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface NominatimSearchItem {
  name?: string;
  display_name?: string;
  lat: string;
  lon: string;
}

interface NominatimReverseItem {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
  };
}

export async function searchLocations(query: string, limit = 5): Promise<GeocodingLocation[]> {
  if (query.trim().length < 2) {
    return [];
  }

  const searchParams = new URLSearchParams({
    q: query.trim(),
    limit: String(limit),
    countrycodes: "es",
  });
  const url = `${API_BASE_URL}/api/geocoding/search?${searchParams.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Location search failed");
  }

  const items = (await response.json()) as NominatimSearchItem[];
  return (items || []).map((item) => ({
    name: item.name || item.display_name?.split(",")[0] || "",
    address: item.display_name || "",
    lat: Number(item.lat),
    lng: Number(item.lon),
  }));
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingLocation> {
  const searchParams = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
  });
  const url = `${API_BASE_URL}/api/geocoding/reverse?${searchParams.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Reverse geocoding failed");
  }

  const item = (await response.json()) as NominatimReverseItem;
  return {
    name:
      item.address?.city ||
      item.address?.town ||
      item.address?.village ||
      item.address?.municipality ||
      item.address?.county ||
      "Punto del mapa",
    address: item.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    lat,
    lng,
  };
}
