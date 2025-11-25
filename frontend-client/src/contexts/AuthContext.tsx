import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { authAPI } from '../services/auth';
import type { User } from '../types/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  loginWithGoogle: () => void;
  register: (nombre: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
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
    } catch (error: any) {
      console.error('❌ Error en login:', error);
      throw new Error(error.response?.data?.error || 'Error al iniciar sesión');
    }
  };

  // Login con token (para OAuth callbacks)
  const loginWithToken = useCallback(async (newToken: string) => {
    try {
      localStorage.setItem('authToken', newToken);
      setToken(newToken);
      const userData = await authAPI.getProfile();
      setUser(userData);
    } catch (error: any) {
      console.error('❌ Error en loginWithToken:', error);
      localStorage.removeItem('authToken');
      setToken(null);
      throw new Error(error.response?.data?.error || 'Error al iniciar sesión con token');
    }
  }, []);

  // Iniciar flujo de Google OAuth (ahora va al gateway, no a usuarios-service)
  const loginWithGoogle = useCallback(() => {
    window.location.href = `${API_URL}/api/auth/google`;
  }, []);

  const register = async (nombre: string, email: string, password: string) => {
    try {
      await authAPI.register({ nombre, email, password });
      // Después de registrarse, hacer login automáticamente
      await login(email, password);
    } catch (error: any) {
      console.error('❌ Error en registro:', error);
      throw new Error(error.response?.data?.error || 'Error al registrarse');
    }
  };

  const logout = () => {
    authAPI.logout();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        loginWithToken,
        loginWithGoogle,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
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
