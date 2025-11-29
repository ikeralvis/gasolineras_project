import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFavorites } from './useFavorites';

// Mock del contexto de auth
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext';

// Helper para crear mock del contexto
const createAuthMock = (overrides = {}) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  loading: false,
  login: vi.fn(),
  loginWithToken: vi.fn(),
  loginWithGoogleCredential: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  ...overrides,
});

describe('useFavorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('debería retornar array vacío si no está autenticado', async () => {
    vi.mocked(useAuth).mockReturnValue(createAuthMock());

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favoritos).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('debería cargar favoritos cuando está autenticado', async () => {
    vi.mocked(useAuth).mockReturnValue(createAuthMock({
      user: { id: 1, nombre: 'Test', email: 'test@test.com' },
      token: 'valid-token',
      isAuthenticated: true,
    }));

    const mockFavoritos = [
      { ideess: '12345', created_at: '2024-01-01' },
      { ideess: '67890', created_at: '2024-01-02' },
    ];

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFavoritos),
    } as Response);

    const { result } = renderHook(() => useFavorites());

    await waitFor(() => {
      expect(result.current.favoritos).toEqual(['12345', '67890']);
    });
  });

  it('esFavorito debería retornar true para gasolineras en favoritos', async () => {
    vi.mocked(useAuth).mockReturnValue(createAuthMock({
      user: { id: 1, nombre: 'Test', email: 'test@test.com' },
      token: 'valid-token',
      isAuthenticated: true,
    }));

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ ideess: '12345', created_at: '2024-01-01' }]),
    } as Response);

    const { result } = renderHook(() => useFavorites());

    await waitFor(() => {
      expect(result.current.favoritos).toContain('12345');
    });

    expect(result.current.esFavorito('12345')).toBe(true);
    expect(result.current.esFavorito('99999')).toBe(false);
  });

  it('agregarFavorito debería lanzar error si no está autenticado', async () => {
    vi.mocked(useAuth).mockReturnValue(createAuthMock());

    const { result } = renderHook(() => useFavorites());

    await expect(result.current.agregarFavorito('12345')).rejects.toThrow(
      'Debes iniciar sesión para agregar favoritos'
    );
  });

  it('agregarFavorito debería añadir favorito correctamente', async () => {
    vi.mocked(useAuth).mockReturnValue(createAuthMock({
      user: { id: 1, nombre: 'Test', email: 'test@test.com' },
      token: 'valid-token',
      isAuthenticated: true,
    }));

    // Mock carga inicial
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    const { result } = renderHook(() => useFavorites());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Mock para agregar favorito
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ideess: '12345' }),
    } as Response);

    await act(async () => {
      await result.current.agregarFavorito('12345');
    });

    expect(result.current.favoritos).toContain('12345');
  });

  it('eliminarFavorito debería eliminar favorito correctamente', async () => {
    vi.mocked(useAuth).mockReturnValue(createAuthMock({
      user: { id: 1, nombre: 'Test', email: 'test@test.com' },
      token: 'valid-token',
      isAuthenticated: true,
    }));

    // Mock carga inicial con un favorito
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ ideess: '12345', created_at: '2024-01-01' }]),
    } as Response);

    const { result } = renderHook(() => useFavorites());

    await waitFor(() => {
      expect(result.current.favoritos).toContain('12345');
    });

    // Mock para eliminar favorito
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: 'Eliminado' }),
    } as Response);

    await act(async () => {
      await result.current.eliminarFavorito('12345');
    });

    expect(result.current.favoritos).not.toContain('12345');
  });

  it('toggleFavorito debería agregar si no existe', async () => {
    vi.mocked(useAuth).mockReturnValue(createAuthMock({
      user: { id: 1, nombre: 'Test', email: 'test@test.com' },
      token: 'valid-token',
      isAuthenticated: true,
    }));

    // Mock carga inicial vacía
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    const { result } = renderHook(() => useFavorites());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Mock para agregar
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ideess: '12345' }),
    } as Response);

    await act(async () => {
      await result.current.toggleFavorito('12345');
    });

    expect(result.current.favoritos).toContain('12345');
  });
});
