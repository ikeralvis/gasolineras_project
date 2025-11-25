import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const success = searchParams.get('success');
    const errorParam = searchParams.get('error');
    // Legacy: por si aún viene token en URL (compatibilidad)
    const legacyToken = searchParams.get('token');

    if (errorParam) {
      setError(getErrorMessage(errorParam));
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    // Nuevo flujo: success=true significa que el token está en cookie
    if (success === 'true') {
      // Obtener token desde el endpoint seguro (viene en cookie HttpOnly)
      fetch(`${API_URL}/api/auth/token`, {
        credentials: 'include' // Importante para enviar cookies
      })
        .then(res => {
          if (!res.ok) throw new Error('No se pudo obtener token');
          return res.json();
        })
        .then(data => {
          if (data.token) {
            return loginWithToken(data.token);
          }
          throw new Error('Token no recibido');
        })
        .then(() => {
          navigate('/');
        })
        .catch((err) => {
          console.error('Error en callback:', err);
          setError('Error al iniciar sesión. Intenta de nuevo.');
          setTimeout(() => navigate('/login'), 3000);
        });
    } else if (legacyToken) {
      // Legacy: token en URL (menos seguro, pero por compatibilidad)
      loginWithToken(legacyToken)
        .then(() => {
          navigate('/');
        })
        .catch((err) => {
          console.error('Error en login con token:', err);
          setError('Error al iniciar sesión. Intenta de nuevo.');
          setTimeout(() => navigate('/login'), 3000);
        });
    } else {
      setError('No se recibió autenticación válida');
      setTimeout(() => navigate('/login'), 3000);
    }
  }, [searchParams, navigate, loginWithToken]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-[#E8EAFE] via-[#F1F2FF] to-[#E3E6FF]">
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
