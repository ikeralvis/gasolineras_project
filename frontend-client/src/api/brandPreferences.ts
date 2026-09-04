import { apiFetch } from "./http";

export interface BrandPreference {
  marca: string;
  es_socio: boolean;
  created_at: string;
}

export async function fetchBrandPreferences(): Promise<BrandPreference[]> {
  const response = await apiFetch("/api/usuarios/marcas-favoritas");
  if (!response.ok) {
    throw new Error("Error al cargar marcas favoritas");
  }
  return response.json();
}

export async function setBrandPreference(marca: string, esSocio: boolean): Promise<BrandPreference> {
  const response = await apiFetch(`/api/usuarios/marcas-favoritas/${encodeURIComponent(marca)}`, {
    method: "PUT",
    body: JSON.stringify({ es_socio: esSocio }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Error al guardar la marca favorita");
  }
  return response.json();
}

export async function removeBrandPreference(marca: string): Promise<void> {
  const response = await apiFetch(`/api/usuarios/marcas-favoritas/${encodeURIComponent(marca)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Error al quitar la marca favorita");
  }
}
