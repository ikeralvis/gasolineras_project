import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { AuthService } from './authService.js';

function buildService(overrides = {}) {
  const userRepository = {
    create: vi.fn(),
    findByEmail: vi.fn(),
    setGoogleId: vi.fn(),
    createGoogleUser: vi.fn(),
    ...overrides.userRepository,
  };
  const jwt = {
    sign: vi.fn().mockReturnValue('jwt-token'),
    ...overrides.jwt,
  };

  return {
    service: new AuthService({ userRepository, jwt, jwtExpiresIn: '7d' }),
    userRepository,
    jwt,
  };
}

describe('AuthService', () => {
  it('rechaza registro con email inválido', async () => {
    const { service } = buildService();
    const result = await service.register({ nombre: 'A', email: 'bad-mail', password: 'Password123!' });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('mapea duplicado de email a 409', async () => {
    const err = new Error('dup');
    err.code = '23505';
    const { service } = buildService({ userRepository: { create: vi.fn().mockRejectedValue(err) } });

    const result = await service.register({
      nombre: 'Ana',
      email: 'ana@test.com',
      password: 'Password123!',
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(409);
  });

  it('login inválido si no existe usuario', async () => {
    const { service } = buildService({ userRepository: { findByEmail: vi.fn().mockResolvedValue(null) } });
    const result = await service.login({ email: 'none@test.com', password: 'Password123!' });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it('login exitoso devuelve token interno para cookie', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const { service, userRepository, jwt } = buildService({
      userRepository: {
        findByEmail: vi.fn().mockResolvedValue({
          id: 1,
          nombre: 'Ana',
          email: 'ana@test.com',
          is_admin: false,
          password_hash: passwordHash,
        }),
      },
    });

    const result = await service.login({ email: 'ana@test.com', password: 'Password123!' });

    expect(userRepository.findByEmail).toHaveBeenCalled();
    expect(jwt.sign).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.data.token).toBe('jwt-token');
  });

  it('rechaza registro con contraseña débil', async () => {
    const { service } = buildService();
    const result = await service.register({ nombre: 'Ana', email: 'ana@test.com', password: 'weakpass' });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('registro exitoso devuelve los datos del usuario creado', async () => {
    const created = { id: 1, nombre: 'Ana', email: 'ana@test.com' };
    const { service } = buildService({
      userRepository: { create: vi.fn().mockResolvedValue(created) },
    });
    const result = await service.register({ nombre: 'Ana', email: 'ana@test.com', password: 'Password123!' });
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(201);
    expect(result.data).toEqual(created);
  });

  it('loginOrCreateGoogle vincula google_id a usuario existente que no lo tenía', async () => {
    const user = { id: 1, nombre: 'Ana', email: 'ana@test.com', is_admin: false, google_id: null };
    const { service, userRepository } = buildService({
      userRepository: {
        findByEmail: vi.fn().mockResolvedValue(user),
        setGoogleId: vi.fn().mockResolvedValue(undefined),
      },
    });
    const result = await service.loginOrCreateGoogle({ google_id: 'g123', email: 'ana@test.com', name: 'Ana' });
    expect(userRepository.setGoogleId).toHaveBeenCalledWith(1, 'g123');
    expect(result.ok).toBe(true);
    expect(result.data.token).toBe('jwt-token');
  });

  it('loginOrCreateGoogle crea usuario nuevo cuando no existe y devuelve token', async () => {
    const newUser = { id: 2, nombre: 'Bot', email: 'bot@test.com', is_admin: false };
    const { service, userRepository } = buildService({
      userRepository: {
        findByEmail: vi.fn().mockResolvedValue(null),
        createGoogleUser: vi.fn().mockResolvedValue(newUser),
      },
    });
    const result = await service.loginOrCreateGoogle({ google_id: 'g456', email: 'bot@test.com', name: 'Bot' });
    expect(userRepository.createGoogleUser).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.data.token).toBe('jwt-token');
  });
});
