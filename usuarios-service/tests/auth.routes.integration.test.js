import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authRoutes } from '../src/routes/auth.js';

describe('Auth routes integration', () => {
  let app;
  let authService;

  beforeEach(async () => {
    app = Fastify();
    await app.register(fastifyCookie);

    authService = {
      login: vi.fn().mockResolvedValue({ ok: true, data: { token: 'signed-jwt' } }),
      register: vi.fn().mockResolvedValue({ ok: true, statusCode: 201, data: { id: 1 } }),
      loginOrCreateGoogle: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: { token: 'g' } }),
    };

    app.decorate('services', {
      authService,
      userService: {
        getMe: vi.fn(),
        updateMe: vi.fn(),
        deleteMe: vi.fn(),
        listUsers: vi.fn(),
      },
    });
    app.decorate('settings', { nodeEnv: 'development' });
    app.decorate('verifyInternalSecret', async () => {});

    await app.register(authRoutes, { prefix: '/api/usuarios' });
    await app.ready();
  });

  it('login usa cookie httpOnly y no expone token en body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/usuarios/login',
      payload: { email: 'ana@test.com', password: 'Password123!' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toContain('authToken=signed-jwt');

    const body = response.json();
    expect(body).toEqual({ authenticated: true, cookieSet: true });
    expect(body.token).toBeUndefined();
  });

  it('register mantiene respuesta del servicio', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/usuarios/register',
      payload: { nombre: 'Ana', email: 'ana@test.com', password: 'Password123!' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: 1 });
    expect(authService.register).toHaveBeenCalled();
  });
});
