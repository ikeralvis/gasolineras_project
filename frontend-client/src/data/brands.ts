import repsol from "../assets/logos/repsol.svg";
import cepsa from "../assets/logos/cepsa.jpg";
import bp from "../assets/logos/bp.png";
import shell from "../assets/logos/shell.png";
import galp from "../assets/logos/galp.png";
import eroski from "../assets/logos/eroski.svg";
import moeve from "../assets/logos/moeve.png";
import petronor from "../assets/logos/petronor.png";
import costco from "../assets/logos/costco.png";
import easygas from "../assets/logos/easygas.png";
import petroprix from "../assets/logos/petroprix.png";

export interface BrandDef {
  /** Identificador estable, en minúsculas, usado también como clave de persistencia en el backend. */
  id: string;
  label: string;
  logo: string;
  color: string;
  /** Substrings en minúsculas a buscar dentro del campo Rótulo de una gasolinera. */
  keywords: string[];
}

// Registro único de marcas: antes había 4 listas distintas y descoordinadas
// (GasolinerasTable, Gasolineras, MapaGasolineras, GasolineraDetalle), cada
// una reconociendo un subconjunto distinto de marcas.
export const BRANDS: BrandDef[] = [
  { id: "repsol", label: "Repsol", logo: repsol, color: "#D32F2F", keywords: ["repsol"] },
  { id: "cepsa", label: "Cepsa", logo: cepsa, color: "#0050AC", keywords: ["cepsa"] },
  { id: "bp", label: "BP", logo: bp, color: "#007A33", keywords: ["bp"] },
  { id: "shell", label: "Shell", logo: shell, color: "#FBBB00", keywords: ["shell"] },
  { id: "galp", label: "Galp", logo: galp, color: "#FF6B00", keywords: ["galp"] },
  { id: "eroski", label: "Eroski", logo: eroski, color: "#C41E3A", keywords: ["eroski"] },
  { id: "moeve", label: "Moeve", logo: moeve, color: "#00A19A", keywords: ["moeve"] },
  { id: "petronor", label: "Petronor", logo: petronor, color: "#1A1A1A", keywords: ["petronor"] },
  { id: "costco", label: "Costco", logo: costco, color: "#004F9E", keywords: ["costco"] },
  { id: "easygas", label: "Easygas", logo: easygas, color: "#EA580C", keywords: ["easygas", "easy gas"] },
  { id: "petroprix", label: "Petroprix", logo: petroprix, color: "#DC2626", keywords: ["petroprix"] },
];

const BRANDS_BY_ID = new Map(BRANDS.map(b => [b.id, b]));

export function getBrandByRotulo(rotulo?: string | null): BrandDef | null {
  const name = (rotulo ?? "").toLowerCase();
  if (!name) return null;
  return BRANDS.find(b => b.keywords.some(k => name.includes(k))) ?? null;
}

export function getBrandLogoByRotulo(rotulo?: string | null): string | null {
  return getBrandByRotulo(rotulo)?.logo ?? null;
}

export function getBrandById(id: string): BrandDef | null {
  return BRANDS_BY_ID.get(id) ?? null;
}
