import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchBrandPreferences, setBrandPreference, removeBrandPreference } from '../api/brandPreferences';

export interface BrandPref {
  marca: string;
  esSocio: boolean;
}

let sharedBrands: BrandPref[] | null = null;
const sharedListeners = new Set<(brands: BrandPref[]) => void>();

function notifyShared(brands: BrandPref[]) {
  for (const listener of sharedListeners) {
    listener(brands);
  }
}

function setSharedBrands(brands: BrandPref[]) {
  sharedBrands = brands;
  notifyShared(brands);
}

export function useBrandPreferences() {
  const { isAuthenticated } = useAuth();
  const [marcas, setMarcas] = useState<BrandPref[]>(sharedBrands ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarMarcas = useCallback(async () => {
    if (!isAuthenticated) {
      setSharedBrands([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchBrandPreferences();
      setSharedBrands(rows.map(r => ({ marca: r.marca, esSocio: r.es_socio })));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar marcas favoritas';
      setError(message);
      console.error('Error cargando marcas favoritas:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const listener = (brands: BrandPref[]) => setMarcas(brands);
    sharedListeners.add(listener);
    return () => { sharedListeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void cargarMarcas();
    } else {
      setSharedBrands([]);
    }
  }, [isAuthenticated, cargarMarcas]);

  const esMarcaFavorita = useCallback((marca: string): boolean => {
    return marcas.some(m => m.marca === marca);
  }, [marcas]);

  const getSocio = useCallback((marca: string): boolean => {
    return marcas.find(m => m.marca === marca)?.esSocio ?? false;
  }, [marcas]);

  const guardarMarca = async (marca: string, esSocio: boolean) => {
    if (!isAuthenticated) {
      throw new Error('Debes iniciar sesión para guardar marcas favoritas');
    }
    setError(null);
    try {
      await setBrandPreference(marca, esSocio);
      const next = marcas.filter(m => m.marca !== marca);
      next.push({ marca, esSocio });
      setSharedBrands(next);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar la marca favorita';
      setError(message);
      throw err;
    }
  };

  const quitarMarca = async (marca: string) => {
    if (!isAuthenticated) {
      throw new Error('Debes iniciar sesión');
    }
    setError(null);
    try {
      await removeBrandPreference(marca);
      setSharedBrands(marcas.filter(m => m.marca !== marca));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al quitar la marca favorita';
      setError(message);
      throw err;
    }
  };

  const toggleMarca = async (marca: string) => {
    if (esMarcaFavorita(marca)) {
      await quitarMarca(marca);
    } else {
      await guardarMarca(marca, false);
    }
  };

  return {
    marcas,
    loading,
    error,
    esMarcaFavorita,
    getSocio,
    guardarMarca,
    quitarMarca,
    toggleMarca,
    recargar: cargarMarcas,
  };
}
