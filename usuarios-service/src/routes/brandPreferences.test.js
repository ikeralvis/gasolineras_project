import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { brandPreferencesRoutes } from './brandPreferences.js';

vi.mock('../hooks/authHooks.js', () => ({
  verifyJwt: vi.fn(async (request) => {
    request.user = { id: 1 };
  }),
}));

function buildBrandPreferenceService(overrides = {}) {
  return {
    setBrandPreference: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: { marca: 'repsol', es_socio: false } }),
    listBrandPreferences: vi.fn().mockResolvedValue({ ok: true, statusCode: 200, data: [{ marca: 'repsol', es_socio: false }] }),
    deleteBrandPreference: vi.fn().mockResolvedValue({ ok: true, statusCode: 204, data: null }),
    ...overrides,
  };
}

async function buildApp(serviceOverrides = {}) {
  const app = Fastify({ logger: false });
  app.decorate('services', { brandPreferenceService: buildBrandPreferenceService(serviceOverrides) });
  await app.register(brandPreferencesRoutes, { prefix: '/api/usuarios' });
  await app.ready();
  return app;
}

describe('brandPreferencesRoutes — PUT /marcas-favoritas/:marca', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 200 al marcar una marca como favorita', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/usuarios/marcas-favoritas/repsol',
      headers: { authorization: 'Bearer fake' },
      payload: { es_socio: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('marca', 'repsol');
  });

  it('→ 400 si el servicio rechaza la marca', async () => {
    app = await buildApp({
      setBrandPreference: vi.fn().mockResolvedValue({ ok: false, statusCode: 400, error: 'marca es requerida' }),
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/usuarios/marcas-favoritas/repsol',
      headers: { authorization: 'Bearer fake' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error');
  });
});

describe('brandPreferencesRoutes — GET /marcas-favoritas', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 200 devuelve lista de marcas favoritas', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/usuarios/marcas-favoritas',
      headers: { authorization: 'Bearer fake' },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});

describe('brandPreferencesRoutes — DELETE /marcas-favoritas/:marca', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 204 al eliminar una marca favorita existente', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/usuarios/marcas-favoritas/repsol',
      headers: { authorization: 'Bearer fake' },
    });
    expect(res.statusCode).toBe(204);
  });

  it('→ 404 si la marca favorita no existe', async () => {
    app = await buildApp({
      deleteBrandPreference: vi.fn().mockResolvedValue({ ok: false, statusCode: 404, error: 'No encontrada' }),
    });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/usuarios/marcas-favoritas/inexistente',
      headers: { authorization: 'Bearer fake' },
    });
    expect(res.statusCode).toBe(404);
  });
});
