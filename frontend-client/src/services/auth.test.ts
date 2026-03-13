import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import axios from 'axios';
import { authAPI } from './auth';

const mockedInstance = {
  post: vi.fn(),
  get: vi.fn(),
};

const TEST_PASSWORD = ['Pass', 'word', '123!'].join('');

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockedInstance),
  },
}));

const mockedCreate = axios.create as Mock;

describe('authAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreate.mockReturnValue(mockedInstance);
  });

  describe('register', () => {
    it('deberia registrar un usuario correctamente', async () => {
      const userData = {
        nombre: 'Test User',
        email: 'test@example.com',
        password: TEST_PASSWORD,
      };
      const mockResponse = {
        data: { id: 1, nombre: 'Test User', email: 'test@example.com' },
      };
      mockedInstance.post.mockResolvedValueOnce(mockResponse);

      const result = await authAPI.register(userData);

      expect(mockedCreate).toHaveBeenCalled();
      expect(mockedInstance.post).toHaveBeenCalledWith('/api/usuarios/register', userData);
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('login', () => {
    it('deberia hacer login y obtener perfil en sesion cookie', async () => {
      const credentials = {
        email: 'test@example.com',
        password: TEST_PASSWORD,
      };
      const mockLoginResponse = { data: { token: 'jwt-token-123' } };
      const mockProfileResponse = {
        data: { id: 1, nombre: 'Test User', email: 'test@example.com' },
      };

      mockedInstance.post.mockResolvedValueOnce(mockLoginResponse);
      mockedInstance.get.mockResolvedValueOnce(mockProfileResponse);

      const result = await authAPI.login(credentials);

      expect(mockedInstance.post).toHaveBeenCalledWith('/api/usuarios/login', credentials);
      expect(mockedInstance.get).toHaveBeenCalledWith('/api/usuarios/me');
      expect(result).toEqual({ token: 'jwt-token-123', user: mockProfileResponse.data });
    });

    it('deberia devolver user aunque el login no incluya token en body', async () => {
      mockedInstance.post.mockResolvedValueOnce({ data: {} });
      mockedInstance.get.mockResolvedValueOnce({ data: { id: 1, nombre: 'Test User', email: 'test@example.com' } });

      const result = await authAPI.login({ email: 'test@example.com', password: TEST_PASSWORD });

      expect(result.token).toBeUndefined();
      expect(result.user.email).toBe('test@example.com');
    });
  });

  describe('getProfile', () => {
    it('deberia obtener perfil usando sesion de cookie', async () => {
      const mockProfile = { id: 1, nombre: 'Test User', email: 'test@example.com' };
      mockedInstance.get.mockResolvedValueOnce({ data: mockProfile });

      const result = await authAPI.getProfile();

      expect(mockedInstance.get).toHaveBeenCalledWith('/api/usuarios/me');
      expect(result).toEqual(mockProfile);
    });
  });

  describe('logout', () => {
    it('deberia llamar al endpoint de logout del gateway', async () => {
      mockedInstance.post.mockResolvedValueOnce({ data: { ok: true } });

      await authAPI.logout();

      expect(mockedInstance.post).toHaveBeenCalledWith('/api/auth/logout');
    });
  });
});
