import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { healthRoutes } from './health.js';

function makeClient(queryResult = {}, shouldThrow = false) {
  return {
    query: shouldThrow
      ? vi.fn().mockRejectedValue(new Error('DB error'))
      : vi.fn().mockResolvedValue(queryResult),
    release: vi.fn(),
  };
}

async function buildApp(pgOverride = null) {
  const app = Fastify({ logger: false });
  if (pgOverride) {
    app.decorate('pg', pgOverride);
  }
  await app.register(healthRoutes);
  await app.ready();
  return app;
}

describe('healthRoutes — GET /health', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 200 con DB conectada', async () => {
    const client = makeClient({ rows: [{ ping: 1 }] });
    app = await buildApp({ connect: vi.fn().mockResolvedValue(client) });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.database.status).toBe('connected');
    expect(typeof body.uptime).toBe('number');
    expect(client.release).toHaveBeenCalled();
  });

  it('→ 503 si la DB no está disponible', async () => {
    app = await buildApp({ connect: vi.fn().mockRejectedValue(new Error('connection refused')) });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    // El schema de 503 solo serializa status y error (database es eliminado por Fastify)
    expect(res.json().status).toBe('error');
  });
});

describe('healthRoutes — GET /ready', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 200 {ready: true} cuando la DB responde', async () => {
    const client = makeClient({ rows: [{ '?column?': 1 }] });
    app = await buildApp({ connect: vi.fn().mockResolvedValue(client) });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ready: true });
    expect(client.release).toHaveBeenCalled();
  });

  it('→ 503 {ready: false} cuando la DB falla', async () => {
    app = await buildApp({ connect: vi.fn().mockRejectedValue(new Error('no DB')) });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().ready).toBe(false);
  });
});

describe('healthRoutes — GET /live', () => {
  let app;
  afterEach(async () => { await app?.close(); });

  it('→ 200 {alive: true} siempre', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ alive: true });
  });
});
