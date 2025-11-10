import { Gasolinera } from "./types";

export async function getGasolineras(): Promise<Gasolinera[]> {
  const res = await fetch("http://localhost:8080/api/gasolineras");
  const data = await res.json();

  // El backend devuelve { gasolineras: [...] } así que entramos al array
  return data.gasolineras.map((g: any) => ({
    IDEESS: g.IDEESS,
    rotulo: g["Rótulo"],
    municipio: g.Municipio,
    provincia: g.Provincia,
    direccion: g["Dirección"],
    gasolina95: parseFloat((g["Precio Gasolina 95 E5"] || "0").replace(",", ".")) || null,
    gasoleoA: parseFloat((g["Precio Gasoleo A"] || "0").replace(",", ".")) || null,
    lat: g.Latitud,
    lng: g.Longitud
  }));
}

export async function getGasolinerasCerca(lat: number, lon: number, km = 50): Promise<Gasolinera[]> {
  const res = await fetch(`http://localhost:8080/api/gasolineras/cerca?lat=${lat}&lon=${lon}&km=${km}`);
  const data = await res.json();

  return data.gasolineras.map((g: any) => ({
    IDEESS: g.IDEESS,
    rotulo: g["Rótulo"],
    municipio: g.Municipio,
    provincia: g.Provincia,
    direccion: g["Dirección"],
    gasolina95: parseFloat((g["Precio Gasolina 95 E5"] || "0").replace(",", ".")) || null,
    gasoleoA: parseFloat((g["Precio Gasoleo A"] || "0").replace(",", ".")) || null,
    lat: g.Latitud,
    lng: g.Longitud
  }));
}
