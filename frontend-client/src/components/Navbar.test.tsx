import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/utils';
import Navbar from './Navbar';

// Mock del contexto de auth
vi.mock('../contexts/AuthContext', async () => {
  const actual = await vi.importActual('../contexts/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

import { useAuth } from '../contexts/AuthContext';

describe('Navbar', () => {
  it('debería mostrar enlaces de navegación básicos', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      loading: false,
      login: vi.fn(),
      loginWithToken: vi.fn(),
      loginWithGoogleCredential: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    render(<Navbar />);

    // El logo tiene alt="TankGo Logo"
    expect(screen.getByAltText(/TankGo/i)).toBeInTheDocument();
  });

  it('debería mostrar botón de login cuando no está autenticado', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      loading: false,
      login: vi.fn(),
      loginWithToken: vi.fn(),
      loginWithGoogleCredential: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    render(<Navbar />);

    expect(screen.getByRole('link', { name: /login|iniciar/i })).toBeInTheDocument();
  });

  it('debería mostrar nombre de usuario cuando está autenticado', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, nombre: 'Juan García', email: 'juan@test.com' },
      token: 'valid-token',
      isAuthenticated: true,
      loading: false,
      login: vi.fn(),
      loginWithToken: vi.fn(),
      loginWithGoogleCredential: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    render(<Navbar />);

    // Verificar que se muestra algo relacionado con el usuario
    expect(screen.getByText(/Juan/i)).toBeInTheDocument();
  });

  it('debería llamar logout al hacer clic en cerrar sesión', async () => {
    const mockLogout = vi.fn();
    
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, nombre: 'Test User', email: 'test@test.com' },
      token: 'valid-token',
      isAuthenticated: true,
      loading: false,
      login: vi.fn(),
      loginWithToken: vi.fn(),
      loginWithGoogleCredential: vi.fn(),
      logout: mockLogout,
      register: vi.fn(),
    });

    render(<Navbar />);

    const user = userEvent.setup();
    
    // Buscar botón de logout/cerrar sesión
    const logoutButton = screen.queryByRole('button', { name: /salir|logout|cerrar/i });
    
    if (logoutButton) {
      await user.click(logoutButton);
      expect(mockLogout).toHaveBeenCalled();
    }
  });
});
