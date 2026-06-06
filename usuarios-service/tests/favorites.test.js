/**
 * Tests de integración — Favorites routes con PostgreSQL real.
 * Se ejecutan con: npx vitest run --config vitest.integration.config.js
 *
 * Requieren DATABASE_URL apuntando a una instancia postgres con el schema creado.
 * Si DATABASE_URL no está definido, todos los tests se omiten.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestServer } from './helpers/buildTestServer.js';

const hasDB = !!process.env.DATABASE_URL;

describe.skipIf(!hasDB)('Favorites integration', () => {
  let app;
  let authToken;
  let userId;

  const email = `test-fav-${Date.now()}@example.com`;

  beforeAll(async () => {
    app = await buildTestServer();

    // Registrar usuario de prueba y obtener su id
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/usuarios/register',
      payload: { nombre: 'Fav Tester', email, password: 'TestPass!123' },
    });

    expect(regRes.statusCode).toBe(201);
    userId = regRes.json().id;

    // Generar JWT directamente (sin pasar por login) para mayor control
    authToken = app.jwt.sign({
      id: userId,
      email: email.toLowerCase(),
      is_admin: false,
      nombre: 'Fav Tester',
    });
  });

  afterAll(async () => {
    await app.pg.query('DELETE FROM user_favorites WHERE true');
    await app.pg.query("DELETE FROM users WHERE email LIKE 'test-fav-%@example.com'");
    await app.close();
  });

  // ── POST /favoritos ──────────────────────────────────────────────────────────

  it('POST /favoritos → 201 con JWT válido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/favoritos',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { ideess: '12345' },
    });

    expect(res.statusCode).toBe(201);
  });

  it('POST /favoritos → 401 sin JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/favoritos',
      payload: { ideess: '99999' },
    });

    expect(res.statusCode).toBe(401);
  });

  // ── DELETE /favoritos/:ideess ────────────────────────────────────────────────

  it('DELETE /favoritos/:ideess → 204 si existe', async () => {
    // Primero añadir el favorito
    await app.inject({
      method: 'POST',
      url: '/api/usuarios/favoritos',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { ideess: '11111' },
    });

    // Luego borrarlo
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/usuarios/favoritos/11111',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(204);
  });

  it('DELETE /favoritos/:ideess → 404 si no existe', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/usuarios/favoritos/ideess-que-no-existe-xyz',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  // ── GET /favoritos/all-ideess (interno) ──────────────────────────────────────

  it('GET /favoritos/all-ideess → 403 sin X-Internal-Secret', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios/favoritos/all-ideess',
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toHaveProperty('error');
  });
});
