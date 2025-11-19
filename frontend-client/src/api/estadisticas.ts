import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export interface Estadisticas {
  total_gasolineras: number;
  filtros: {
    provincia: string | null;
    municipio: string | null;
  };
  combustibles: {
    gasolina_95?: EstadisticasCombustible;
    gasolina_98?: EstadisticasCombustible;
    gasoleo_a?: EstadisticasCombustible;
    gasoleo_b?: EstadisticasCombustible;
    gasoleo_premium?: EstadisticasCombustible;
  };
  timestamp: string;
}

export interface EstadisticasCombustible {
  min: number;
  max: number;
  media: number;
  mediana: number;
  p25: number;  // Percentil 25 - Umbral "precio bajo"
  p75: number;  // Percentil 75 - Umbral "precio alto"
  total_muestras: number;
}

/**
 * Obtiene estadísticas de precios de combustibles
 * @param provincia - Filtrar por provincia (opcional)
 * @param municipio - Filtrar por municipio (opcional)
 */
export async function getEstadisticas(
  provincia?: string,
  municipio?: string
): Promise<Estadisticas> {
  const params = new URLSearchParams();
  if (provincia) params.append('provincia', provincia);
  if (municipio) params.append('municipio', municipio);
  
  const url = `${API_URL}/api/gasolineras/estadisticas${params.toString() ? '?' + params.toString() : ''}`;
  const response = await axios.get<Estadisticas>(url);
  return response.data;
}

/**
 * Determina si un precio es bajo según las estadísticas
 */
export function esPrecioBajo(precio: number, stats: EstadisticasCombustible): boolean {
  return precio < stats.p25;
}

/**
 * Determina si un precio es alto según las estadísticas
 */
export function esPrecioAlto(precio: number, stats: EstadisticasCombustible): boolean {
  return precio > stats.p75;
}

/**
 * Obtiene el badge de precio basado en estadísticas
 */
export function getPriceBadgeFromStats(
  precioStr: string,
  stats: EstadisticasCombustible | undefined
): { texto: string; color: string } | null {
  if (!stats) return null;
  
  const precio = Number.parseFloat(precioStr.replace(',', '.'));
  if (Number.isNaN(precio) || precio === 0) return null;

  if (esPrecioBajo(precio, stats)) {
    return {
      texto: `Bajo (${((precio - stats.media) / stats.media * 100).toFixed(1)}%)`,
      color: 'green'
    };
  }
  
  if (esPrecioAlto(precio, stats)) {
    return {
      texto: `Alto (+${((precio - stats.media) / stats.media * 100).toFixed(1)}%)`,
      color: 'red'
    };
  }
  
  return null;
}
