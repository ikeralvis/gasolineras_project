import { Gasolinera } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export async function getGasolineras(): Promise<Gasolinera[]> {
  const res = await fetch(`${API_BASE_URL}/api/gasolineras`);
  const data = await res.json();

  // El backend devuelve { gasolineras: [...] } así que entramos al array
  return data.gasolineras.map((g: any) => ({
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
    return data.gasolineras;
  } catch (error) {
    console.error("❌ Error en getGasolinerasCerca:", error);
    return [];
  }
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
