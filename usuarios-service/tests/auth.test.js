/**
 * Tests de integración — Auth routes con PostgreSQL real.
 * Se ejecutan con: npx vitest run --config vitest.integration.config.js
 *
 * Requieren DATABASE_URL apuntando a una instancia postgres con el schema creado.
 * Si DATABASE_URL no está definido, todos los tests se omiten.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestServer } from './helpers/buildTestServer.js';

const hasDB = !!process.env.DATABASE_URL;

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
});

describe.skipIf(!hasDB)('POST /api/usuarios/login', () => {
  let app;
  const email = `test-auth-login-${Date.now()}@example.com`;
  const password = 'TestPass!123';

  beforeAll(async () => {
    app = await buildTestServer();
    // Registrar usuario de prueba
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
    // Fastify setea la cookie en la cabecera set-cookie
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

  it('devuelve 429 al 6º intento (rate limit)', async () => {
    // IP externa para no estar en el allowList ['127.0.0.1', '::1']
    const rateLimitIp = '203.0.113.42';
    const payload = { email: 'noexiste-rl@example.com', password: 'AnyPass!1' };

    // Consumir las 5 peticiones del quota (retornan 401 por user no existente)
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/usuarios/login',
        remoteAddress: rateLimitIp,
        payload,
      });
      expect(r.statusCode).not.toBe(429); // todavía no debe estar limitado
    }

    // La 6ª debe ser bloqueada
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/login',
      remoteAddress: rateLimitIp,
      payload,
    });

    expect(res.statusCode).toBe(429);
  });
});
