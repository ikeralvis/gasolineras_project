import { useState } from 'react';
import { FaHeart, FaRegHeart } from 'react-icons/fa';
import { useFavorites } from '../hooks/useFavorites';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface FavoritoButtonProps {
  ideess: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export default function FavoritoButton({ 
  ideess, 
  size = 'md', 
  showLabel = false,
  className = ''
}: FavoritoButtonProps) {
  const { isAuthenticated } = useAuth();
  const { esFavorito, toggleFavorito } = useFavorites();
  const [loading, setLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const navigate = useNavigate();

  const isFav = esFavorito(ideess);

  const sizeClasses = {
    sm: 'text-sm p-1.5',
    md: 'text-base p-2',
    lg: 'text-lg p-3',
  };

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 22,
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setLoading(true);
    try {
      await toggleFavorito(ideess);
    } catch (error) {
      console.error('Error al cambiar favorito:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative inline-block">
      <div className="flex items-center gap-2">
        <button
          onClick={handleClick}
          disabled={loading}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className={`
            ${sizeClasses[size]}
            ${isFav 
              ? 'text-red-500 hover:text-red-600' 
              : 'text-gray-400 hover:text-red-500'
            }
            transition-all duration-200
            disabled:opacity-50
            disabled:cursor-not-allowed
            hover:scale-110
            active:scale-95
            rounded-full
            ${className}
          `}
          title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        >
          {loading ? (
            <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-red-500 w-${iconSizes[size]} h-${iconSizes[size]}`} />
          ) : (
            <>
              {isFav ? (
                <FaHeart size={iconSizes[size]} />
              ) : (
                <FaRegHeart size={iconSizes[size]} />
              )}
            </>
          )}
        </button>

        {showLabel && !loading && (
          <span className="text-sm font-medium text-gray-600">
            {isFav ? 'Favorito' : 'Guardar'}
          </span>
        )}
      </div>

      {showTooltip && !isAuthenticated && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap z-50">
          Inicia sesión para guardar favoritos
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-800"></div>
        </div>
      )}
    </div>
  );
}
