import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHeart, FaMapMarkerAlt, FaRoute } from 'react-icons/fa';
import { useFavorites } from '../hooks/useFavorites';
import { useAuth } from '../contexts/AuthContext';
import GasolinerasTable from '../components/GasolinerasTable';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

interface Gasolinera {
  IDEESS: string;
  Rótulo: string;
  Municipio: string;
  Provincia: string;
  'Precio Gasolina 95 E5': string;
  'Precio Gasolina 98 E5'?: string;
  'Precio Gasoleo A': string;
  'Precio Gasoleo B'?: string;
  'Precio Gasoleo Premium'?: string;
  [key: string]: string | undefined;
}

export default function Favoritos() {
  const { isAuthenticated, user } = useAuth();
  const { favoritos, loading: favLoading } = useFavorites();
  const [gasolineras, setGasolineras] = useState<Gasolinera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const combustibleSeleccionado = user?.combustible_favorito || "Precio Gasolina 95 E5";
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (favoritos.length === 0 && !favLoading) {
      setLoading(false);
      return;
    }

    if (favoritos.length > 0) {
      cargarGasolinerasFavoritas();
    }
  }, [favoritos, favLoading, isAuthenticated, navigate]);

  const cargarGasolinerasFavoritas = async () => {
    setLoading(true);
    setError(null);

    try {
      // Obtener detalles de cada gasolinera favorita
      const promesas = favoritos.map(ideess =>
        fetch(`${API_URL}/api/gasolineras/${ideess}`)
          .then(res => res.ok ? res.json() : null)
          .catch(() => null)
      );

      const resultados = await Promise.all(promesas);
      const gasolinerasValidas = resultados.filter(g => g !== null) as Gasolinera[];

      setGasolineras(gasolinerasValidas);
    } catch (err: any) {
      setError(err.message || 'Error al cargar gasolineras favoritas');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || favLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-[#E8EAFE] via-[#F1F2FF] to-[#E3E6FF] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#000C74] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Cargando favoritos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-linear-to-br from-[#E8EAFE] via-[#F1F2FF] to-[#E3E6FF] flex items-center justify-center px-4">
        <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-xl max-w-md">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-[#E8EAFE] via-[#F1F2FF] to-[#E3E6FF] py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-500 p-3 rounded-xl shadow-lg">
                <FaHeart className="text-white w-8 h-8" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-[#000C74]">
                  Mis Favoritos
                </h1>
                <p className="text-gray-600 mt-1">
                  {gasolineras.length === 0 
                    ? 'No tienes gasolineras favoritas aún'
                    : `${gasolineras.length} gasolinera${gasolineras.length !== 1 ? 's' : ''} guardada${gasolineras.length !== 1 ? 's' : ''}`
                  }
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/gasolineras')}
              className="px-6 py-3 bg-[#000C74] text-white rounded-xl hover:bg-[#001A8A] transition font-medium flex items-center gap-2 shadow-lg"
            >
              <FaRoute />
              Explorar Gasolineras
            </button>
          </div>
        </div>

        {/* Contenido */}
        {gasolineras.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-xl p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="bg-gray-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                <FaHeart className="text-gray-400 w-12 h-12" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-3">
                No tienes favoritos guardados
              </h2>
              <p className="text-gray-600 mb-6">
                Empieza a guardar tus gasolineras favoritas haciendo clic en el icono de corazón ❤️ 
                en cualquier gasolinera de la lista.
              </p>
              <button
                onClick={() => navigate('/gasolineras')}
                className="px-8 py-4 bg-linear-to-r from-[#000C74] to-[#4A52D9] text-white rounded-xl font-bold hover:shadow-lg hover:scale-105 transition-all inline-flex items-center gap-2"
              >
                <FaMapMarkerAlt />
                Buscar Gasolineras
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Estadísticas rápidas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Precio Medio G95</p>
                    <p className="text-2xl font-bold text-[#000C74] mt-1">
                      {(gasolineras.reduce((acc, g) => {
                        const precio = Number.parseFloat(g['Precio Gasolina 95 E5'].replace(',', '.'));
                        return acc + (Number.isNaN(precio) ? 0 : precio);
                      }, 0) / gasolineras.length).toFixed(3)}€
                    </p>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Precio Medio Diésel</p>
                    <p className="text-2xl font-bold text-[#000C74] mt-1">
                      {(gasolineras.reduce((acc, g) => {
                        const precio = Number.parseFloat(g['Precio Gasoleo A'].replace(',', '.'));
                        return acc + (Number.isNaN(precio) ? 0 : precio);
                      }, 0) / gasolineras.length).toFixed(3)}€
                    </p>
                  </div>
                  <div className="bg-green-100 p-3 rounded-lg">
                    <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Total Favoritos</p>
                    <p className="text-2xl font-bold text-[#000C74] mt-1">
                      {gasolineras.length}
                    </p>
                  </div>
                  <div className="bg-red-100 p-3 rounded-lg">
                    <FaHeart className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Tabla de gasolineras */}
            <GasolinerasTable 
              gasolineras={gasolineras} 
              combustibleSeleccionado={combustibleSeleccionado}
            />
          </>
        )}
      </div>
    </div>
  );
}
