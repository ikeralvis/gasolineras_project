import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

interface Favorito {
  ideess: string;
  created_at: string;
}

export function useFavorites() {
  const { token, isAuthenticated } = useAuth();
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar favoritos al montar o cuando cambie el token
  const cargarFavoritos = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setFavoritos([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/usuarios/favoritos`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Error al cargar favoritos');
      }

      const data: Favorito[] = await response.json();
      setFavoritos(data.map(f => f.ideess));
    } catch (err: any) {
      setError(err.message);
      console.error('Error cargando favoritos:', err);
    } finally {
      setLoading(false);
    }
  }, [token, isAuthenticated]);

  // Cargar favoritos al montar
  useEffect(() => {
    cargarFavoritos();
  }, [cargarFavoritos]);

  // Verificar si una gasolinera es favorita
  const esFavorito = useCallback((ideess: string): boolean => {
    return favoritos.includes(ideess);
  }, [favoritos]);

  // Añadir favorito
  const agregarFavorito = async (ideess: string) => {
    if (!isAuthenticated || !token) {
      throw new Error('Debes iniciar sesión para agregar favoritos');
    }

    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/usuarios/favoritos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ ideess }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al agregar favorito');
      }

      // Actualizar estado local
      setFavoritos(prev => [...prev, ideess]);
      return true;
    } catch (err: any) {
      setError(err.message);
      console.error('Error agregando favorito:', err);
      throw err;
    }
  };

  // Eliminar favorito
  const eliminarFavorito = async (ideess: string) => {
    if (!isAuthenticated || !token) {
      throw new Error('Debes iniciar sesión');
    }

    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/usuarios/favoritos/${ideess}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al eliminar favorito');
      }

      // Actualizar estado local
      setFavoritos(prev => prev.filter(id => id !== ideess));
      return true;
    } catch (err: any) {
      setError(err.message);
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
