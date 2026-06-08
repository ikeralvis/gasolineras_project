import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { authRoutes } from './auth.js';

vi.mock('../hooks/authHooks.js', () => ({
  verifyJwt: vi.fn(async (request) => {
    request.user = { id: 1, email: 'test@test.com', is_admin: false, nombre: 'Test' };
  }),
  adminOnlyHook: vi.fn(async () => {}),
}));

function buildServices(overrides = {}) {
  return {
    authService: {
      login: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: { token: 'jwt-token' } }),
      register: vi.fn().mockResolvedValue({ ok: true, statusCode: 201, data: { id: 1 } }),
      loginOrCreateGoogle: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: { token: 'jwt' } }),
      ...overrides.authService,
    },
    userService: {
      getMe: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: { id: 1, nombre: 'Test' } }),
      updateMe: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: { id: 1, nombre: 'Actualizado' } }),
      deleteMe: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: { message: 'Cuenta eliminada' } }),
      listUsers: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: [{ id: 1 }] }),
      ...overrides.userService,
    },
  };
}

async function buildApp(overrides = {}, nodeEnv = 'development') {
  const app = Fastify({ logger: false });
  await app.register(fastifyCookie);
  app.decorate('services', buildServices(overrides));
  app.decorate('settings', { nodeEnv });
  app.decorate('verifyInternalSecret', vi.fn(async () => {}));
  await app.register(authRoutes, { prefix: '/api/usuarios' });
  await app.ready();
  return app;
}

describe('authRoutes — login', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('POST /login → 200 y establece cookie authToken en development', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/login',
      payload: { email: 'a@a.com', password: 'Password1!' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authenticated: true, cookieSet: true });
    expect(String(res.headers['set-cookie'])).toContain('authToken=jwt-token');
  });

  it('POST /login → cookie Secure en production', async () => {
    app = await buildApp({}, 'production');
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/login',
      payload: { email: 'a@a.com', password: 'Password1!' },
    });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['set-cookie'])).toContain('Secure');
  });

  it('POST /login → 401 si el servicio devuelve error', async () => {
    app = await buildApp({
      authService: { login: vi.fn().mockResolvedValue({ ok: false, statusCode: 401, error: 'Credenciales inválidas' }) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/login',
      payload: { email: 'a@a.com', password: 'Password1!' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty('error');
  });
});

describe('authRoutes — register', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('POST /register → 409 si el servicio devuelve error de duplicado', async () => {
    app = await buildApp({
      authService: { register: vi.fn().mockResolvedValue({ ok: false, statusCode: 409, error: 'Email ya registrado' }) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/register',
      payload: { nombre: 'A', email: 'a@a.com', password: 'Password1!' },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('authRoutes — logout', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('POST /logout → 200 y mensaje de sesión cerrada', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/usuarios/logout' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('message');
  });
});

describe('authRoutes — GET /me', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('GET /me → 200 devuelve perfil del usuario', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios/me',
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('id', 1);
  });

  it('GET /me → 404 si el servicio no encuentra el usuario', async () => {
    app = await buildApp({
      userService: { getMe: vi.fn().mockResolvedValue({ ok: false, statusCode: 404, error: 'No encontrado' }) },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios/me',
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('authRoutes — PATCH /me', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('PATCH /me → 200 actualiza y devuelve datos', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/usuarios/me',
      headers: { authorization: 'Bearer fake-token' },
      payload: { nombre: 'Nuevo Nombre' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('nombre');
  });

  it('PATCH /me → 400 si el servicio rechaza el body', async () => {
    app = await buildApp({
      userService: { updateMe: vi.fn().mockResolvedValue({ ok: false, statusCode: 400, error: 'Bad input' }) },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/usuarios/me',
      headers: { authorization: 'Bearer fake-token' },
      payload: { nombre: 'X' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('authRoutes — DELETE /me', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('DELETE /me → 200 elimina la cuenta', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/usuarios/me',
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('message');
  });

  it('DELETE /me → 404 si el usuario no existe', async () => {
    app = await buildApp({
      userService: { deleteMe: vi.fn().mockResolvedValue({ ok: false, statusCode: 404, error: 'No encontrado' }) },
    });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/usuarios/me',
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('authRoutes — GET / (lista usuarios)', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('GET / → 200 devuelve lista de usuarios', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios',
      headers: { authorization: 'Bearer fake-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});

describe('authRoutes — POST /google/internal', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('POST /google/internal → 200 con datos de Google', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/google/internal',
      payload: { google_id: 'g123', email: 'google@test.com', name: 'Google User' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('token');
  });

  it('POST /google/internal → error si el servicio falla', async () => {
    app = await buildApp({
      authService: { loginOrCreateGoogle: vi.fn().mockResolvedValue({ ok: false, statusCode: 500, error: 'Error' }) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/google/internal',
      payload: { google_id: 'g123', email: 'google@test.com', name: 'Google User' },
    });
    expect(res.statusCode).toBe(500);
  });
});
