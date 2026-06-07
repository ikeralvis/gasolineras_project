/**
 * Tests de integración — User profile (GET/PATCH/DELETE /me, logout, probes).
 * Se ejecutan con: npx vitest run --config vitest.integration.config.js
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestServer } from './helpers/buildTestServer.js';

const hasDB = !!process.env.DATABASE_URL;

// ── Perfil de usuario (GET /me, PATCH /me, POST /logout, probes) ──────────────

describe.skipIf(!hasDB)('User profile integration', () => {
  let app;
  let authToken;
  let userId;
  const email = `test-user-${Date.now()}@example.com`;
  const password = 'TestPass!123';

  beforeAll(async () => {
    app = await buildTestServer();

    const regRes = await app.inject({
      method: 'POST',
      url: '/api/usuarios/register',
      payload: { nombre: 'Profile Tester', email, password },
    });
    expect(regRes.statusCode).toBe(201);
    userId = regRes.json().id;

    authToken = app.jwt.sign({
      id: userId,
      email: email.toLowerCase(),
      is_admin: false,
      nombre: 'Profile Tester',
    });
  });

  afterAll(async () => {
    await app.pg.query("DELETE FROM user_favorites WHERE true");
    await app.pg.query("DELETE FROM users WHERE email LIKE 'test-user-%@example.com'");
    await app.close();
  });

  // ── GET /me ────────────────────────────────────────────────────────────────

  it('GET /me → 200 devuelve perfil del usuario', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios/me',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe(email.toLowerCase());
    expect(body).not.toHaveProperty('password_hash');
  });

  it('GET /me → 401 sin JWT', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/usuarios/me' });
    expect(res.statusCode).toBe(401);
  });

  // ── POST /logout ───────────────────────────────────────────────────────────

  it('POST /logout → 200 limpia cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/usuarios/logout' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('message');
  });

  // ── PATCH /me ─────────────────────────────────────────────────────────────

  it('PATCH /me → 200 actualiza nombre', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/usuarios/me',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { nombre: 'Nombre Nuevo' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().nombre).toBe('Nombre Nuevo');
  });

  it('PATCH /me → 200 actualiza modelo_coche', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/usuarios/me',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { modelo_coche: 'Toyota Yaris' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().modelo_coche).toBe('Toyota Yaris');
  });

  it('PATCH /me → 200 tipo_combustible_coche diesel infiere combustible_favorito', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/usuarios/me',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { tipo_combustible_coche: 'diesel' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().combustible_favorito).toBe('Precio Gasoleo A');
  });

  it('PATCH /me → 200 tipo_combustible_coche gasolina infiere combustible_favorito', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/usuarios/me',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { tipo_combustible_coche: 'gasolina' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().combustible_favorito).toBe('Precio Gasolina 95 E5');
  });

  it('PATCH /me → 400 body vacío (sin campos para actualizar)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/usuarios/me',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /me → 401 sin JWT', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/usuarios/me',
      payload: { nombre: 'Sin Auth' },
    });
    expect(res.statusCode).toBe(401);
  });

  // ── GET / (lista usuarios, solo admin) ────────────────────────────────────

  it('GET /api/usuarios → 403 para usuario no admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/usuarios → 200 para usuario admin', async () => {
    const adminToken = app.jwt.sign({
      id: userId,
      email: email.toLowerCase(),
      is_admin: true,
      nombre: 'Admin Tester',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  // ── Probes (health.js) ─────────────────────────────────────────────────────

  it('GET /ready → 200 cuando la BD está disponible', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ready).toBe(true);
  });

  it('GET /live → 200 (liveness probe)', async () => {
    const res = await app.inject({ method: 'GET', url: '/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json().alive).toBe(true);
  });
});

// ── DELETE /me (describe separado para no interferir con los anteriores) ───────

describe.skipIf(!hasDB)('DELETE /me', () => {
  let app;

  beforeAll(async () => { app = await buildTestServer(); });

  afterAll(async () => {
    await app.pg.query("DELETE FROM users WHERE email LIKE 'test-del-%@example.com'");
    await app.close();
  });

  it('DELETE /me → 200 elimina la cuenta', async () => {
    const email = `test-del-${Date.now()}@example.com`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/usuarios/register',
      payload: { nombre: 'Delete Me', email, password: 'TestPass!123' },
    });
    expect(regRes.statusCode).toBe(201);
    const { id } = regRes.json();
    const token = app.jwt.sign({ id, email, is_admin: false, nombre: 'Delete Me' });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/usuarios/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('message');
  });

  it('DELETE /me → 401 sin JWT', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/usuarios/me' });
    expect(res.statusCode).toBe(401);
  });
});
