/**
 * Tests de integración — Auth routes con PostgreSQL real.
 * Se ejecutan con: npx vitest run --config vitest.integration.config.js
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestServer } from './helpers/buildTestServer.js';

const hasDB = !!process.env.DATABASE_URL;

describe.skipIf(!hasDB)('GET /health', () => {
  let app;

  beforeAll(async () => { app = await buildTestServer(); });
  afterAll(async () => { await app.close(); });

  it('devuelve 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});

describe.skipIf(!hasDB)('POST /api/usuarios/register', () => {
  let app;
  const email = `test-auth-reg-${Date.now()}@example.com`;
  const password = 'TestPass!123';

  beforeAll(async () => {
    app = await buildTestServer();
    await app.pg.query("DELETE FROM user_favorites WHERE true");
    await app.pg.query("DELETE FROM users WHERE email LIKE 'test-auth-%@example.com'");
  });

  afterAll(async () => {
    await app.pg.query("DELETE FROM user_favorites WHERE true");
    await app.pg.query("DELETE FROM users WHERE email LIKE 'test-auth-%@example.com'");
    await app.close();
  });

  it('devuelve 201 con usuario nuevo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/register',
      payload: { nombre: 'Test Auth', email, password },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.email).toBe(email.toLowerCase());
    expect(body).not.toHaveProperty('password_hash');
  });

  it('devuelve 409 si el email ya existe', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/register',
      payload: { nombre: 'Test Auth', email, password },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toHaveProperty('error');
  });

  it('devuelve 400 si falta el campo email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/register',
      payload: { nombre: 'Sin Email', password: 'TestPass!123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('devuelve 400 si falta la contraseña', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/register',
      payload: { nombre: 'Sin Pass', email: 'sinpass@example.com' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe.skipIf(!hasDB)('POST /api/usuarios/login', () => {
  let app;
  const email = `test-auth-login-${Date.now()}@example.com`;
  const password = 'TestPass!123';

  beforeAll(async () => {
    app = await buildTestServer();
    await app.inject({
      method: 'POST',
      url: '/api/usuarios/register',
      payload: { nombre: 'Login Tester', email, password },
    });
  });

  afterAll(async () => {
    await app.pg.query("DELETE FROM users WHERE email LIKE 'test-auth-login-%@example.com'");
    await app.close();
  });

  it('devuelve 200 y establece cookie authToken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/login',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authenticated).toBe(true);
    expect(body.cookieSet).toBe(true);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain('authToken');
  });

  it('devuelve 401 con password incorrecta', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/login',
      payload: { email, password: 'WrongPassword!999' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty('error');
  });

  it('devuelve 400 si faltan campos requeridos', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/login',
      payload: { email },
    });
    expect(res.statusCode).toBe(400);
  });

  it('devuelve 429 al 6º intento (rate limit)', async () => {
    const rateLimitIp = '203.0.113.42';
    const payload = { email: 'noexiste-rl@example.com', password: 'AnyPass!1' };

    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/usuarios/login',
        remoteAddress: rateLimitIp,
        payload,
      });
      expect(r.statusCode).not.toBe(429);
    }

    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/login',
      remoteAddress: rateLimitIp,
      payload,
    });

    expect(res.statusCode).toBe(429);
  });
});
