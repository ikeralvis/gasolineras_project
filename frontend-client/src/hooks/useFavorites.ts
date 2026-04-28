import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api/http';

interface Favorito {
  ideess: string;
  created_at: string;
}

const FAVORITES_CACHE_TTL_MS = 60 * 1000;

let sharedFavoritos: string[] | null = null;
let sharedUpdatedAt = 0;
let sharedRequest: Promise<string[]> | null = null;
const sharedListeners = new Set<(ids: string[]) => void>();

function notifyShared(ids: string[]) {
  for (const listener of sharedListeners) {
    listener(ids);
  }
}

function setSharedFavoritos(ids: string[]) {
  const unique = [...new Set(ids)];
  sharedFavoritos = unique;
  sharedUpdatedAt = Date.now();
  notifyShared(unique);
}

async function fetchSharedFavoritos(forceRefresh = false): Promise<string[]> {
  if (
    !forceRefresh &&
    Array.isArray(sharedFavoritos) &&
    Date.now() - sharedUpdatedAt < FAVORITES_CACHE_TTL_MS
  ) {
    return sharedFavoritos;
  }

  if (sharedRequest) {
    return sharedRequest;
  }

  sharedRequest = (async () => {
    const response = await apiFetch('/api/usuarios/favoritos');
    if (!response.ok) {
      throw new Error('Error al cargar favoritos');
    }

    const data: Favorito[] = await response.json();
    const ids = data.map((f) => f.ideess);
    setSharedFavoritos(ids);
    return ids;
  })().finally(() => {
    sharedRequest = null;
  });

  return sharedRequest;
}

export function useFavorites() {
  const { isAuthenticated } = useAuth();
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar favoritos al montar o cuando cambie el estado de autenticación
  const cargarFavoritos = useCallback(async (forceRefresh = false) => {
    if (!isAuthenticated) {
      sharedFavoritos = null;
      sharedUpdatedAt = 0;
      setFavoritos([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ids = await fetchSharedFavoritos(forceRefresh);
      setFavoritos(ids);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar favoritos';
      setError(message);
      console.error('Error cargando favoritos:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const listener = (ids: string[]) => {
      setFavoritos(ids);
    };
    sharedListeners.add(listener);

    if (Array.isArray(sharedFavoritos)) {
      setFavoritos(sharedFavoritos);
    }

    return () => {
      sharedListeners.delete(listener);
    };
  }, []);

  // Cargar favoritos al montar
  useEffect(() => {
    if (isAuthenticated) {
      void cargarFavoritos(true);
      return;
    }
    setFavoritos([]);
  }, [cargarFavoritos, isAuthenticated]);

  // Verificar si una gasolinera es favorita
  const esFavorito = useCallback((ideess: string): boolean => {
    return favoritos.includes(ideess);
  }, [favoritos]);

  // Añadir favorito
  const agregarFavorito = async (ideess: string) => {
    if (!isAuthenticated) {
      throw new Error('Debes iniciar sesión para agregar favoritos');
    }

    if (esFavorito(ideess)) {
      return true;
    }

    setError(null);

    try {
      const response = await apiFetch('/api/usuarios/favoritos', {
        method: 'POST',
        body: JSON.stringify({ ideess }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al agregar favorito');
      }

      const next = new Set(sharedFavoritos ?? favoritos);
      next.add(ideess);
      setSharedFavoritos([...next]);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al agregar favorito';
      setError(message);
      console.error('Error agregando favorito:', err);
      throw err;
    }
  };

  // Eliminar favorito
  const eliminarFavorito = async (ideess: string) => {
    if (!isAuthenticated) {
      throw new Error('Debes iniciar sesión');
    }

    setError(null);

    try {
      const response = await apiFetch(`/api/usuarios/favoritos/${ideess}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al eliminar favorito');
      }

      const next = (sharedFavoritos ?? favoritos).filter((id) => id !== ideess);
      setSharedFavoritos(next);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar favorito';
      setError(message);
      console.error('Error eliminando favorito:', err);
      throw err;
    }
  };

  // Toggle favorito (añadir si no existe, eliminar si existe)
  const toggleFavorito = async (ideess: string) => {
    if (esFavorito(ideess)) {
      await eliminarFavorito(ideess);
    } else {
      await agregarFavorito(ideess);
    }
  };

  return {
    favoritos,
    loading,
    error,
    esFavorito,
    agregarFavorito,
    eliminarFavorito,
    toggleFavorito,
    recargar: cargarFavoritos,
  };
}
