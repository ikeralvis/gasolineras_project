import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FaHeart, FaMapMarkerAlt, FaRoute } from 'react-icons/fa';
import { useFavorites } from '../hooks/useFavorites';
import { useAuth } from '../contexts/AuthContext';
import GasolinerasTable from '../components/GasolinerasTable';

const API_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

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
  const { t } = useTranslation();
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
          <p className="text-gray-600 font-medium">{t('favorites.loadingFavorites')}</p>
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
    <div className="min-h-screen bg-linear-to-br from-[#F5F6FF] via-[#EEF0FF] to-[#E9ECFF] py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-[#D9DBF2] bg-white/80 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#000C74] text-white flex items-center justify-center shadow">
                <FaHeart className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-[#0f172a]">
                  {t('favorites.title')}
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  {gasolineras.length === 0
                    ? t('favorites.noFavorites')
                    : t('favorites.stationSaved', { count: gasolineras.length })
                  }
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/gasolineras')}
              className="w-full md:w-auto px-5 py-2.5 bg-[#000C74] text-white rounded-xl hover:bg-[#001A8A] transition font-medium flex items-center justify-center gap-2 shadow"
            >
              <FaRoute />
              {t('favorites.exploreStations')}
            </button>
          </div>
        </div>

        {/* Contenido */}
        {gasolineras.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-xl p-8 md:p-12">
            <div className="grid gap-8 md:grid-cols-[1.2fr_1fr] items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#EEF0FF] px-3 py-1 text-xs font-semibold text-[#000C74]">
                  <FaHeart />
                  {t('favorites.noFavorites')}
                </div>
                <h2 className="text-2xl md:text-3xl font-semibold text-[#0f172a] mt-4 mb-3">
                  {t('favorites.noFavoritesDescription')}
                </h2>
                <p className="text-gray-600 max-w-md">
                  {t('favorites.searchStations')}
                </p>
                <button
                  onClick={() => navigate('/gasolineras')}
                  className="mt-6 px-6 py-3 bg-[#000C74] text-white rounded-xl font-semibold hover:bg-[#001A8A] transition inline-flex items-center gap-2"
                >
                  <FaMapMarkerAlt />
                  {t('favorites.searchStations')}
                </button>
              </div>
              <div className="relative">
                <div className="absolute -top-6 -left-6 h-20 w-20 rounded-2xl bg-[#EEF0FF]" />
                <div className="absolute -bottom-4 -right-4 h-16 w-16 rounded-2xl bg-[#DCE0FF]" />
                <div className="relative rounded-3xl border border-[#E6E9FF] bg-linear-to-br from-[#F7F8FF] to-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-white shadow flex items-center justify-center text-[#000C74]">
                      <FaHeart className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{t('favorites.totalFavorites')}</p>
                      <p className="text-2xl font-bold text-[#0f172a]">0</p>
                    </div>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-[#EEF0FF]">
                    <div className="h-2 rounded-full bg-[#000C74]" style={{ width: "18%" }} />
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    {t('favorites.exploreStations')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Estadísticas rápidas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-[#E7E9FB] p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{t('favorites.averagePrice95')}</p>
                    <p className="text-2xl font-bold text-[#000C74] mt-2">
                      {(gasolineras.reduce((acc, g) => {
                        const precio = Number.parseFloat(g['Precio Gasolina 95 E5'].replace(',', '.'));
                        return acc + (Number.isNaN(precio) ? 0 : precio);
                      }, 0) / gasolineras.length).toFixed(3)}€
                    </p>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-xl">
                    <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#E7E9FB] p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{t('favorites.averagePriceDiesel')}</p>
                    <p className="text-2xl font-bold text-[#000C74] mt-2">
                      {(gasolineras.reduce((acc, g) => {
                        const precio = Number.parseFloat(g['Precio Gasoleo A'].replace(',', '.'));
                        return acc + (Number.isNaN(precio) ? 0 : precio);
                      }, 0) / gasolineras.length).toFixed(3)}€
                    </p>
                  </div>
                  <div className="bg-green-100 p-3 rounded-xl">
                    <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#E7E9FB] p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{t('favorites.totalFavorites')}</p>
                    <p className="text-2xl font-bold text-[#000C74] mt-2">
                      {gasolineras.length}
                    </p>
                  </div>
                  <div className="bg-red-100 p-3 rounded-xl">
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
