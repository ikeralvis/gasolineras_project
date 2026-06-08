import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandler } from './errorHandler.js';

async function createApp(registerRoutes = () => {}) {
  const app = Fastify({ logger: false });
  await app.register(errorHandler);
  registerRoutes(app);
  await app.ready();
  return app;
}

describe('errorHandler', () => {
  let app;

  afterEach(async () => {
    await app?.close();
  });

  it('404 para ruta no registrada (notFoundHandler)', async () => {
    app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/ruta-inexistente-xyz' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty('error', 'Ruta no encontrada');
  });

  it('400 para error de validación de JSON Schema', async () => {
    app = await createApp((f) => {
      f.get('/test', {
        schema: {
          querystring: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'integer' } },
          },
        },
      }, async () => 'ok');
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body).toHaveProperty('error', 'Error de validación');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('401 para FST_JWT_NO_AUTHORIZATION_IN_HEADER', async () => {
    app = await createApp((f) => {
      f.get('/test', async () => {
        const err = Object.assign(new Error('no auth'), { code: 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' });
        throw err;
      });
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty('error', 'Token no proporcionado');
  });

  it('401 para FST_JWT_BAD_REQUEST', async () => {
    app = await createApp((f) => {
      f.get('/test', async () => {
        const err = Object.assign(new Error('bad jwt'), { code: 'FST_JWT_BAD_REQUEST' });
        throw err;
      });
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty('error', 'Token inválido');
  });

  it('401 para FST_JWT_AUTHORIZATION_TOKEN_INVALID', async () => {
    app = await createApp((f) => {
      f.get('/test', async () => {
        const err = Object.assign(new Error('invalid token'), { code: 'FST_JWT_AUTHORIZATION_TOKEN_INVALID' });
        throw err;
      });
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty('error', 'Token inválido');
  });

  it('401 para FST_JWT_AUTHORIZATION_TOKEN_EXPIRED', async () => {
    app = await createApp((f) => {
      f.get('/test', async () => {
        const err = Object.assign(new Error('expired'), { code: 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED' });
        throw err;
      });
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty('error', 'Token expirado');
  });

  it('409 para error 23505 (unique_violation)', async () => {
    app = await createApp((f) => {
      f.get('/test', async () => {
        const err = Object.assign(new Error('dup'), { code: '23505' });
        throw err;
      });
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toHaveProperty('error', 'Conflicto de duplicación');
  });

  it('400 para error 23503 (foreign_key_violation)', async () => {
    app = await createApp((f) => {
      f.get('/test', async () => {
        const err = Object.assign(new Error('fk'), { code: '23503' });
        throw err;
      });
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error', 'Referencia inválida');
  });

  it('409 para otros errores de integridad PG (23xxx)', async () => {
    app = await createApp((f) => {
      f.get('/test', async () => {
        const err = Object.assign(new Error('integrity'), { code: '23000' });
        throw err;
      });
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toHaveProperty('error', 'Conflicto en base de datos');
  });

  it('429 para error de rate limit', async () => {
    app = await createApp((f) => {
      f.get('/test', async () => {
        const err = Object.assign(new Error('too many'), { statusCode: 429 });
        throw err;
      });
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toHaveProperty('error', 'Demasiadas solicitudes');
  });

  it('404 para error con statusCode 404', async () => {
    app = await createApp((f) => {
      f.get('/test', async () => {
        const err = Object.assign(new Error('not found'), { statusCode: 404 });
        throw err;
      });
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty('error', 'Recurso no encontrado');
  });

  it('403 para error con statusCode 403', async () => {
    app = await createApp((f) => {
      f.get('/test', async () => {
        const err = Object.assign(new Error('forbidden'), { statusCode: 403 });
        throw err;
      });
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toHaveProperty('error', 'Acceso denegado');
  });

  it('500 para error genérico sin statusCode conocido', async () => {
    app = await createApp((f) => {
      f.get('/test', async () => {
        throw new Error('error inesperado');
      });
    });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toHaveProperty('error', 'Error interno del servidor');
  });
});
