import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { authAPI } from '../services/auth';
import type { User } from '../types/auth';

type RegisterPayload = {
  nombre: string;
  email: string;
  password: string;
  modelo_coche?: string;
  tipo_combustible_coche?: 'gasolina' | 'diesel' | 'electrico' | 'hibrido';
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  loginWithToken: (token: string) => Promise<User>;
  loginWithGoogleCredential: (credential: string) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

interface AuthProviderProps {
  readonly children: ReactNode;
}

const API_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await authAPI.getProfile();
      setUser(userData);
      setToken('cookie-session');
    } catch {
      setUser(null);
      setToken(null);
    }
  }, []);

  // Cargar perfil del usuario al iniciar usando cookie de sesión
  useEffect(() => {
    async function loadUser() {
      await refreshUser();
      setLoading(false);
    }
    loadUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    try {
      const { token: newToken, user: userData } = await authAPI.login({ email, password });
      setToken(newToken);
      setUser(userData);
      return userData;
    } catch (error: unknown) {
      console.error('❌ Error en login:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      throw new Error(axiosError.response?.data?.error || 'Error al iniciar sesión');
    }
  };

  // Login con token (para OAuth callbacks legacy)
  const loginWithToken = useCallback(async (newToken: string) => {
    try {
      // Flujo legacy: mantener firma, pero resolver perfil con cookie/autorización ya establecida.
      setToken(newToken);
      const userData = await authAPI.getProfile();
      setUser(userData);
      return userData;
    } catch (error: unknown) {
      console.error('❌ Error en loginWithToken:', error);
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
        credentials: 'include',
        body: JSON.stringify({ credential }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al verificar credencial de Google');
      }

      const { token: newToken } = await response.json();
      setToken(newToken || 'cookie-session');
      
      const userData = await authAPI.getProfile();
      setUser(userData);
      return userData;
    } catch (error: unknown) {
      console.error('❌ Error en loginWithGoogleCredential:', error);
      setToken(null);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Error al iniciar sesión con Google');
    }
  }, []);

  const register = async (payload: RegisterPayload) => {
    try {
      await authAPI.register(payload);
      // Después de registrarse, hacer login automáticamente
      await login(payload.email, payload.password);
    } catch (error: unknown) {
      console.error('❌ Error en registro:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      throw new Error(axiosError.response?.data?.error || 'Error al registrarse');
    }
  };

  const logout = useCallback(() => {
    void authAPI.logout();
    setUser(null);
    setToken(null);
  }, []);

  const contextValue = useMemo(() => ({
    user,
    token,
    loading,
    refreshUser,
    login,
    loginWithToken,
    loginWithGoogleCredential,
    register,
    logout,
    isAuthenticated: !!user,
  }), [user, token, loading, refreshUser, login, loginWithToken, loginWithGoogleCredential, register, logout]);

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
