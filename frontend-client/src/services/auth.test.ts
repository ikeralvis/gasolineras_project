import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import axios from 'axios';
import { authAPI } from './auth';

// Mock de axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

const mockedPost = axios.post as Mock;
const mockedGet = axios.get as Mock;

describe('authAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('register', () => {
    it('debería registrar un usuario correctamente', async () => {
      const userData = {
        nombre: 'Test User',
        email: 'test@example.com',
        password: 'Password123!',
      };

      const mockResponse = {
        data: { id: 1, nombre: 'Test User', email: 'test@example.com' },
      };

      mockedPost.mockResolvedValueOnce(mockResponse);

      const result = await authAPI.register(userData);

      expect(mockedPost).toHaveBeenCalledWith(
        expect.stringContaining('/api/usuarios/register'),
        userData
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('debería lanzar error si el registro falla', async () => {
      mockedPost.mockRejectedValueOnce(new Error('Email ya registrado'));

      await expect(
        authAPI.register({
          nombre: 'Test',
          email: 'existing@email.com',
          password: 'Password123!',
        })
      ).rejects.toThrow('Email ya registrado');
    });
  });

  describe('login', () => {
    it('debería hacer login y guardar token', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const mockLoginResponse = {
        data: { token: 'jwt-token-123' },
      };

      const mockProfileResponse = {
        data: { id: 1, nombre: 'Test User', email: 'test@example.com' },
      };

      // Mock localStorage.getItem para que devuelva el token después de setItem
      vi.mocked(localStorage.getItem).mockReturnValue('jwt-token-123');
      
      mockedPost.mockResolvedValueOnce(mockLoginResponse);
      mockedGet.mockResolvedValueOnce(mockProfileResponse);

      const result = await authAPI.login(credentials);

      expect(mockedPost).toHaveBeenCalledWith(
        expect.stringContaining('/api/usuarios/login'),
        credentials
      );
      expect(localStorage.setItem).toHaveBeenCalledWith('authToken', 'jwt-token-123');
      expect(result.token).toBe('jwt-token-123');
      expect(result.user).toEqual(mockProfileResponse.data);
    });

    it('debería lanzar error si no se recibe token', async () => {
      mockedPost.mockResolvedValueOnce({ data: {} });

      await expect(
        authAPI.login({ email: 'test@example.com', password: 'Password123!' })
      ).rejects.toThrow('No se recibió token');
    });
  });

  describe('getProfile', () => {
    it('debería obtener perfil con token válido', async () => {
      const mockProfile = { id: 1, nombre: 'Test User', email: 'test@example.com' };
      
      vi.mocked(localStorage.getItem).mockReturnValue('valid-token');
      mockedGet.mockResolvedValueOnce({ data: mockProfile });

      const result = await authAPI.getProfile();

      expect(mockedGet).toHaveBeenCalledWith(
        expect.stringContaining('/api/usuarios/me'),
        { headers: { Authorization: 'Bearer valid-token' } }
      );
      expect(result).toEqual(mockProfile);
    });

    it('debería lanzar error si no hay token', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null);

      await expect(authAPI.getProfile()).rejects.toThrow('No token');
    });
  });

  describe('logout', () => {
    it('debería eliminar token de localStorage', () => {
      authAPI.logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('authToken');
    });
  });
});
