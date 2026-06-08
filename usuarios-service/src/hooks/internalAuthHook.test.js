import { describe, it, expect, vi } from 'vitest';
import { buildInternalAuthHook } from './internalAuthHook.js';

function makeHook(settingsOverrides = {}) {
  const fastify = { log: { warn: vi.fn() } };
  const settings = {
    useInternalApiSecret: true,
    internalApiSecret: 'my-secret',
    ...settingsOverrides,
  };
  return { hook: buildInternalAuthHook({ fastify, settings }), fastify };
}

describe('buildInternalAuthHook', () => {
  it('no hace nada si useInternalApiSecret es false', async () => {
    const { hook } = makeHook({ useInternalApiSecret: false });
    const request = { headers: {} };
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    await hook(request, reply);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('permite el acceso cuando el secret coincide', async () => {
    const { hook } = makeHook();
    const request = { headers: { 'x-internal-secret': 'my-secret' } };
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    await hook(request, reply);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('devuelve 403 si el secret es incorrecto', async () => {
    const { hook, fastify } = makeHook();
    const request = { headers: { 'x-internal-secret': 'wrong-secret' } };
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    await hook(request, reply);
    expect(fastify.log.warn).toHaveBeenCalled();
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden: Invalid internal secret' });
  });

  it('devuelve 403 si no se envía el header x-internal-secret', async () => {
    const { hook } = makeHook();
    const request = { headers: {} };
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    await hook(request, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
  });
});
