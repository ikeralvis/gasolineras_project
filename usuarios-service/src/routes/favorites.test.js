import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { favoritesRoutes } from './favorites.js';

vi.mock('../hooks/authHooks.js', () => ({
  verifyJwt: vi.fn(async (request) => {
    request.user = { id: 1 };
  }),
}));

function buildFavoriteService(overrides = {}) {
  return {
    addFavorite: vi.fn().mockResolvedValue({ ok: true, statusCode: 201, data: { ideess: '123', message: 'Añadido' } }),
    listFavorites: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: [{ ideess: '123' }] }),
    deleteFavorite: vi.fn().mockResolvedValue({ ok: true, statusCode: 204, data: null }),
    reconcileFavorites: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: { removed_count: 0 } }),
    listAllIdeess: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: { count: 1, ideess: ['123'] } }),
    favoritesStats: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: { count: 1, top_n: 500, min_favorites: 1, stations: [] } }),
    ...overrides,
  };
}

async function buildApp(serviceOverrides = {}) {
  const app = Fastify({ logger: false });
  app.decorate('services', { favoriteService: buildFavoriteService(serviceOverrides) });
  app.decorate('verifyInternalSecret', vi.fn(async () => {}));
  await app.register(favoritesRoutes, { prefix: '/api/usuarios' });
  await app.ready();
  return app;
}

describe('favoritesRoutes — POST /favoritos', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 201 al añadir favorito nuevo', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/favoritos',
      headers: { authorization: 'Bearer fake' },
      payload: { ideess: '123' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toHaveProperty('ideess', '123');
  });

  it('→ 400 si el servicio rechaza el ideess', async () => {
    app = await buildApp({
      addFavorite: vi.fn().mockResolvedValue({ ok: false, statusCode: 400, error: 'ideess es requerido' }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/favoritos',
      headers: { authorization: 'Bearer fake' },
      payload: { ideess: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error');
  });
});

describe('favoritesRoutes — GET /favoritos', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 200 devuelve lista de favoritos', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios/favoritos',
      headers: { authorization: 'Bearer fake' },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});

describe('favoritesRoutes — DELETE /favoritos/:ideess', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 204 al eliminar favorito existente', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/usuarios/favoritos/123',
      headers: { authorization: 'Bearer fake' },
    });
    expect(res.statusCode).toBe(204);
  });

  it('→ 404 si el favorito no existe', async () => {
    app = await buildApp({
      deleteFavorite: vi.fn().mockResolvedValue({ ok: false, statusCode: 404, error: 'No encontrado' }),
    });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/usuarios/favoritos/inexistente',
      headers: { authorization: 'Bearer fake' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('favoritesRoutes — POST /favoritos/reconcile', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 200 devuelve resultado de reconciliación', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/favoritos/reconcile',
      headers: { authorization: 'Bearer fake' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('removed_count');
  });
});

describe('favoritesRoutes — GET /favoritos/all-ideess (interno)', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 200 devuelve lista de ideess distintos', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios/favoritos/all-ideess',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('count');
    expect(Array.isArray(res.json().ideess)).toBe(true);
  });
});

describe('favoritesRoutes — GET /favoritos/stats (interno)', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 200 devuelve estadísticas', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios/favoritos/stats',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('count');
    expect(body).toHaveProperty('stations');
  });

  it('→ 200 respeta parámetros top_n y min_favorites', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios/favoritos/stats?top_n=10&min_favorites=2',
    });
    expect(res.statusCode).toBe(200);
  });
});
