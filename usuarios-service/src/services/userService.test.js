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

  it('getMe devuelve usuario cuando existe', async () => {
    const user = { id: 1, nombre: 'Ana', email: 'ana@test.com' };
    const { service } = buildService({ findById: vi.fn().mockResolvedValue(user) });
    const result = await service.getMe(1);
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual(user);
  });

  it('updateMe actualiza nombre y devuelve usuario actualizado', async () => {
    const updated = { id: 1, nombre: 'Nuevo Nombre', email: 'ana@test.com' };
    const { service } = buildService({
      emailInUseByOtherUser: vi.fn(),
      updateById: vi.fn().mockResolvedValue(updated),
    });
    const result = await service.updateMe(1, { nombre: 'Nuevo Nombre' });
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.data.nombre).toBe('Nuevo Nombre');
  });

  it('updateMe con tipo_combustible_coche diesel infiere combustible_favorito', async () => {
    const updated = { id: 1, tipo_combustible_coche: 'diesel', combustible_favorito: 'Precio Gasoleo A' };
    const { service, userRepository } = buildService({
      emailInUseByOtherUser: vi.fn(),
      updateById: vi.fn().mockResolvedValue(updated),
    });
    await service.updateMe(1, { tipo_combustible_coche: 'diesel' });
    const updates = userRepository.updateById.mock.calls[0][1];
    expect(updates.combustible_favorito).toBe('Precio Gasoleo A');
  });

  it('updateMe con combustible_favorito directo no lo sobreescribe el tipo_combustible_coche', async () => {
    const updated = { id: 1, combustible_favorito: 'Precio Gasoleo A' };
    const { service, userRepository } = buildService({
      emailInUseByOtherUser: vi.fn(),
      updateById: vi.fn().mockResolvedValue(updated),
    });
    await service.updateMe(1, { tipo_combustible_coche: 'gasolina', combustible_favorito: 'Precio Gasoleo A' });
    const updates = userRepository.updateById.mock.calls[0][1];
    expect(updates.combustible_favorito).toBe('Precio Gasoleo A');
  });

  it('updateMe con email inválido devuelve 400', async () => {
    const { service } = buildService({ emailInUseByOtherUser: vi.fn() });
    const result = await service.updateMe(1, { email: 'no-es-un-email' });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('updateMe con contraseña débil devuelve 400', async () => {
    const { service } = buildService({ emailInUseByOtherUser: vi.fn() });
    const result = await service.updateMe(1, { password: 'debil' });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('updateMe devuelve 404 si updateById no encuentra el usuario', async () => {
    const { service } = buildService({
      emailInUseByOtherUser: vi.fn(),
      updateById: vi.fn().mockResolvedValue(null),
    });
    const result = await service.updateMe(1, { nombre: 'Alguien' });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it('updateMe actualiza modelo_coche con trim', async () => {
    const updated = { id: 1, modelo_coche: 'Toyota Yaris' };
    const { service, userRepository } = buildService({
      emailInUseByOtherUser: vi.fn(),
      updateById: vi.fn().mockResolvedValue(updated),
    });
    await service.updateMe(1, { modelo_coche: '  Toyota Yaris  ' });
    const updates = userRepository.updateById.mock.calls[0][1];
    expect(updates.modelo_coche).toBe('Toyota Yaris');
  });

  it('deleteMe devuelve 200 con mensaje cuando se elimina correctamente', async () => {
    const { service } = buildService({ deleteById: vi.fn().mockResolvedValue(true) });
    const result = await service.deleteMe(1);
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.data.message).toContain('eliminada');
  });
});
