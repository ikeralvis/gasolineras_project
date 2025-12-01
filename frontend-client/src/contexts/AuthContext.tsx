import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { authAPI } from '../services/auth';
import type { User } from '../types/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  loginWithGoogleCredential: (credential: string) => Promise<void>;
  register: (nombre: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

interface AuthProviderProps {
  readonly children: ReactNode;
}

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));
  const [loading, setLoading] = useState(true);

  // Cargar perfil del usuario al iniciar si hay token
  useEffect(() => {
    async function loadUser() {
      if (token) {
        try {
          const userData = await authAPI.getProfile();
          setUser(userData);
        } catch (error) {
          console.error('❌ Error al cargar perfil:', error);
          // Si el token es inválido, limpiarlo
          localStorage.removeItem('authToken');
          setToken(null);
        }
      }
      setLoading(false);
    }
    loadUser();
  }, [token]);

  const login = async (email: string, password: string) => {
    try {
      const { token: newToken, user: userData } = await authAPI.login({ email, password });
      setToken(newToken);
      setUser(userData);
    } catch (error: unknown) {
      console.error('❌ Error en login:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      throw new Error(axiosError.response?.data?.error || 'Error al iniciar sesión');
    }
  };

  // Login con token (para OAuth callbacks legacy)
  const loginWithToken = useCallback(async (newToken: string) => {
    try {
      localStorage.setItem('authToken', newToken);
      setToken(newToken);
      const userData = await authAPI.getProfile();
      setUser(userData);
    } catch (error: unknown) {
      console.error('❌ Error en loginWithToken:', error);
      localStorage.removeItem('authToken');
      setToken(null);
      const axiosError = error as { response?: { data?: { error?: string } } };
      throw new Error(axiosError.response?.data?.error || 'Error al iniciar sesión con token');
    }
  }, []);

  // 🆕 Login con credencial de Google (ID Token de @react-oauth/google)
  const loginWithGoogleCredential = useCallback(async (credential: string) => {
    try {
      // Enviar el ID token de Google al backend para verificar y obtener JWT
      const response = await fetch(`${API_URL}/api/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al verificar credencial de Google');
      }

      const { token: newToken } = await response.json();
      localStorage.setItem('authToken', newToken);
      setToken(newToken);
      
      const userData = await authAPI.getProfile();
      setUser(userData);
    } catch (error: unknown) {
      console.error('❌ Error en loginWithGoogleCredential:', error);
      localStorage.removeItem('authToken');
      setToken(null);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Error al iniciar sesión con Google');
    }
  }, []);

  const register = async (nombre: string, email: string, password: string) => {
    try {
      await authAPI.register({ nombre, email, password });
      // Después de registrarse, hacer login automáticamente
      await login(email, password);
    } catch (error: unknown) {
      console.error('❌ Error en registro:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      throw new Error(axiosError.response?.data?.error || 'Error al registrarse');
    }
  };

  const logout = useCallback(() => {
    authAPI.logout();
    setUser(null);
    setToken(null);
  }, []);

  const contextValue = useMemo(() => ({
    user,
    token,
    loading,
    login,
    loginWithToken,
    loginWithGoogleCredential,
    register,
    logout,
    isAuthenticated: !!user,
  }), [user, token, loading, login, loginWithToken, loginWithGoogleCredential, register, logout]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
