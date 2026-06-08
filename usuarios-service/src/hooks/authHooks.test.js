import { describe, it, expect, vi } from 'vitest';
import { verifyJwt, adminOnlyHook } from './authHooks.js';

describe('verifyJwt', () => {
  it('no bloquea la petición si jwtVerify resuelve correctamente', async () => {
    const request = { jwtVerify: vi.fn().mockResolvedValue(undefined), log: { error: vi.fn() } };
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    await verifyJwt(request, reply);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('devuelve 401 si jwtVerify lanza un error', async () => {
    const err = new Error('token inválido');
    const request = { jwtVerify: vi.fn().mockRejectedValue(err), log: { error: vi.fn() } };
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    await verifyJwt(request, reply);
    expect(request.log.error).toHaveBeenCalledWith(err);
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });
});

describe('adminOnlyHook', () => {
  it('no bloquea si el usuario tiene is_admin true', async () => {
    const request = { user: { is_admin: true } };
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    await adminOnlyHook(request, reply);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('devuelve 403 si el usuario no es admin', async () => {
    const request = { user: { is_admin: false } };
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    await adminOnlyHook(request, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden: Admin access required' });
  });

  it('devuelve 403 si request.user es undefined', async () => {
    const request = { user: undefined };
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    await adminOnlyHook(request, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
  });
});
