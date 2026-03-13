import { Gasolinera } from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export interface GasolinerasBoundingBox {
  lat_ne: number;
  lon_ne: number;
  lat_sw: number;
  lon_sw: number;
  zoom: number;
}

export interface GasClusterMarker {
  type: "cluster";
  latitude: number;
  longitude: number;
  count: number;
  min_precio_95_e5?: string;
}

export interface GasStationMarker {
  type: "station";
  station: {
    IDEESS: string;
    Rótulo: string;
    Municipio: string;
    Provincia: string;
    Latitud: number;
    Longitud: number;
    ["Precio Gasolina 95 E5"]: string;
    ["Precio Gasoleo A"]: string;
  };
}

export type GasMarker = GasClusterMarker | GasStationMarker;

function normalizeStationKeys(raw: any) {
  const rotulo = raw?.["Rótulo"] ?? raw?.Rotulo ?? "";
  const direccion = raw?.["Dirección"] ?? raw?.Direccion ?? "";

  return {
    ...raw,
    // Compatibilidad: backend nuevo (Rotulo/Direccion) + frontend legado (Rótulo/Dirección)
    "Rótulo": rotulo,
    Rotulo: rotulo,
    "Dirección": direccion,
    Direccion: direccion,
  };
}

export async function getGasolineras(): Promise<Gasolinera[]> {
  const res = await fetch(`${API_BASE_URL}/api/gasolineras`);
  const data = await res.json();
  const gasolineras = Array.isArray(data.gasolineras)
    ? data.gasolineras.map((g: any) => normalizeStationKeys(g))
    : [];

  // El backend devuelve { gasolineras: [...] } así que entramos al array
  return gasolineras.map((g: any) => ({
    IDEESS: g.IDEESS,
    rotulo: g["Rótulo"],
    municipio: g.Municipio,
    provincia: g.Provincia,
    direccion: g["Dirección"],
    gasolina95: Number.parseFloat((g["Precio Gasolina 95 E5"] || "0").replace(",", ".")) || null,
    gasoleoA: Number.parseFloat((g["Precio Gasoleo A"] || "0").replace(",", ".")) || null,
    lat: g.Latitud,
    lng: g.Longitud
  }));
}

export async function getGasolinerasCerca(lat: number, lon: number, km: number): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/gasolineras/cerca?lat=${lat}&lon=${lon}&km=${km}`);

    if (!res.ok) {
      console.error(`❌ Error en la API ${res.status}`);
      return []; // Devolver array vacío
    }

    const data = await res.json();

    // El backend devuelve { gasolineras: [...] }
    if (!data.gasolineras || !Array.isArray(data.gasolineras)) {
      console.error("⚠️ Respuesta inesperada:", data);
      return [];
    }

    console.log(`✅ Cargadas ${data.gasolineras.length} gasolineras cercanas`);
    
    // Devolver los datos tal como vienen del backend, sin transformar
    // Así mantienen la misma estructura que getGasolineras()
    return data.gasolineras.map((g: any) => normalizeStationKeys(g));
  } catch (error) {
    console.error("❌ Error en getGasolinerasCerca:", error);
    return [];
  }
}

export async function fetchGasMarkers(viewport: GasolinerasBoundingBox): Promise<GasMarker[]> {
  const res = await fetch(`${API_BASE_URL}/api/gasolineras/markers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(viewport),
  });

  if (!res.ok) {
    throw new Error(`Gas markers request failed: ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data.markers)) {
    return [];
  }

  return data.markers.map((marker: any) => {
    if (marker?.type !== 'station' || !marker.station) {
      return marker;
    }

    return {
      ...marker,
      station: normalizeStationKeys(marker.station),
    };
  });
}

export async function getHistorialPrecios(ideess: string, dias: number = 30): Promise<any> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/gasolineras/${ideess}/historial?dias=${dias}`);
    
    if (!res.ok) {
      console.error(`❌ Error al obtener historial ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    console.log(`✅ Historial cargado: ${data.registros} registros`);
    return data;
  } catch (error) {
    console.error("❌ Error en getHistorialPrecios:", error);
    return null;
  }
}
