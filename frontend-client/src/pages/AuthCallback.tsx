import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(getErrorMessage(errorParam));
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    if (token) {
      // Guardar token y obtener perfil
      loginWithToken(token)
        .then(() => {
          navigate('/');
        })
        .catch((err) => {
          console.error('Error en login con token:', err);
          setError('Error al iniciar sesión. Intenta de nuevo.');
          setTimeout(() => navigate('/login'), 3000);
        });
    } else {
      setError('No se recibió token de autenticación');
      setTimeout(() => navigate('/login'), 3000);
    }
  }, [searchParams, navigate, loginWithToken]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E8EAFE] via-[#F1F2FF] to-[#E3E6FF]">
      <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md">
        {error ? (
          <>
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-red-600 mb-2">Error de Autenticación</h1>
            <p className="text-gray-600 mb-4">{error}</p>
            <p className="text-sm text-gray-500">Redirigiendo al login...</p>
          </>
        ) : (
          <>
            <div className="animate-spin text-6xl mb-4">⚙️</div>
            <h1 className="text-2xl font-bold text-[#000C74] mb-2">Iniciando Sesión...</h1>
            <p className="text-gray-600">Por favor espera mientras te autenticamos</p>
          </>
        )}
      </div>
    </div>
  );
}

function getErrorMessage(error: string): string {
  switch (error) {
    case 'google_auth_failed':
      return 'La autenticación con Google falló. Intenta de nuevo.';
    case 'no_code':
      return 'No se recibió código de autorización.';
    case 'token_error':
      return 'Error al obtener el token de acceso.';
    case 'server_error':
      return 'Error del servidor. Intenta más tarde.';
    default:
      return 'Error desconocido. Intenta de nuevo.';
  }
}
