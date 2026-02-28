import { useState, useEffect } from 'react';
import { getEstadisticas, type Estadisticas } from '../api/estadisticas';

interface UseEstadisticasOptions {
  provincia?: string;
  municipio?: string;
  autoLoad?: boolean;
}

export function useEstadisticas(options: UseEstadisticasOptions = {}) {
  const { provincia, municipio, autoLoad = true } = options;
  const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getEstadisticas(provincia, municipio);
      setEstadisticas(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar estadísticas');
      console.error('Error cargando estadísticas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad) {
      cargar();
    }
  }, [provincia, municipio, autoLoad]);

  return {
    estadisticas,
    loading,
    error,
    recargar: cargar,
  };
}
