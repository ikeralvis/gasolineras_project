import { describe, it, expect, vi } from 'vitest';
import { UserService } from './userService.js';

function buildService(overrides = {}) {
  const userRepository = {
    findById: vi.fn(),
    emailInUseByOtherUser: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
    listUsers: vi.fn(),
    ...overrides,
  };

  return { service: new UserService({ userRepository }), userRepository };
}

describe('UserService', () => {
  it('getMe devuelve 404 cuando usuario no existe', async () => {
    const { service } = buildService({ findById: vi.fn().mockResolvedValue(null) });
    const result = await service.getMe(1);
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it('updateMe devuelve conflicto si email ya está en uso', async () => {
    const { service } = buildService({ emailInUseByOtherUser: vi.fn().mockResolvedValue(true) });
    const result = await service.updateMe(1, { email: 'test@test.com' });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(409);
  });

  it('updateMe devuelve 400 si no hay campos útiles', async () => {
    const { service } = buildService();
    const result = await service.updateMe(1, {});
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('deleteMe devuelve 404 cuando no elimina filas', async () => {
    const { service } = buildService({ deleteById: vi.fn().mockResolvedValue(false) });
    const result = await service.deleteMe(1);
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it('listUsers devuelve colección', async () => {
    const rows = [{ id: 1, nombre: 'Ana' }];
    const { service } = buildService({ listUsers: vi.fn().mockResolvedValue(rows) });
    const result = await service.listUsers();
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(rows);
  });
});
