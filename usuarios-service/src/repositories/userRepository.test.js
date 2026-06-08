import { describe, it, expect, vi } from 'vitest';
import { UserRepository } from './userRepository.js';

function makePg(result = { rows: [], rowCount: 0 }) {
  return { query: vi.fn().mockResolvedValue(result) };
}

describe('UserRepository', () => {
  it('create devuelve el usuario creado (rows[0])', async () => {
    const row = { id: 1, nombre: 'Ana', email: 'ana@test.com' };
    const pg = makePg({ rows: [row], rowCount: 1 });
    const repo = new UserRepository(pg);
    const result = await repo.create({ nombre: 'Ana', email: 'ana@test.com', passwordHash: 'h', modeloCoche: null, tipoCombustibleCoche: null, combustibleFavorito: null });
    expect(result).toEqual(row);
    expect(pg.query).toHaveBeenCalledOnce();
  });

  it('create devuelve null si no se insertó ninguna fila', async () => {
    const pg = makePg({ rows: [], rowCount: 0 });
    const repo = new UserRepository(pg);
    const result = await repo.create({ nombre: 'X', email: 'x@x.com', passwordHash: 'h' });
    expect(result).toBeNull();
  });

  it('findByEmail devuelve el usuario si existe', async () => {
    const row = { id: 1, nombre: 'Ana', email: 'ana@test.com', password_hash: 'h', is_admin: false };
    const pg = makePg({ rows: [row], rowCount: 1 });
    const repo = new UserRepository(pg);
    const result = await repo.findByEmail('ana@test.com');
    expect(result).toEqual(row);
    expect(pg.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), ['ana@test.com']);
  });

  it('findByEmail devuelve null si no existe', async () => {
    const repo = new UserRepository(makePg({ rows: [], rowCount: 0 }));
    const result = await repo.findByEmail('noexiste@test.com');
    expect(result).toBeNull();
  });

  it('findById devuelve el usuario si existe', async () => {
    const row = { id: 5, nombre: 'Bot', email: 'bot@test.com' };
    const repo = new UserRepository(makePg({ rows: [row], rowCount: 1 }));
    const result = await repo.findById(5);
    expect(result).toEqual(row);
  });

  it('findById devuelve null si no existe', async () => {
    const repo = new UserRepository(makePg({ rows: [], rowCount: 0 }));
    const result = await repo.findById(99);
    expect(result).toBeNull();
  });

  it('emailInUseByOtherUser devuelve true si hay filas', async () => {
    const repo = new UserRepository(makePg({ rows: [{ id: 2 }], rowCount: 1 }));
    const result = await repo.emailInUseByOtherUser('a@a.com', 1);
    expect(result).toBe(true);
  });

  it('emailInUseByOtherUser devuelve false si no hay filas', async () => {
    const repo = new UserRepository(makePg({ rows: [], rowCount: 0 }));
    const result = await repo.emailInUseByOtherUser('a@a.com', 1);
    expect(result).toBe(false);
  });

  it('updateById llama a pg.query con los campos permitidos y devuelve fila', async () => {
    const updated = { id: 1, nombre: 'Nuevo', email: 'a@a.com' };
    const pg = makePg({ rows: [updated], rowCount: 1 });
    const repo = new UserRepository(pg);
    const result = await repo.updateById(1, { nombre: 'Nuevo', email: 'a@a.com' });
    expect(result).toEqual(updated);
    expect(pg.query).toHaveBeenCalledOnce();
  });

  it('updateById devuelve null si no hay filas devueltas', async () => {
    const pg = makePg({ rows: [], rowCount: 0 });
    const repo = new UserRepository(pg);
    const result = await repo.updateById(1, { nombre: 'X' });
    expect(result).toBeNull();
  });

  it('updateById devuelve null sin llamar a pg si todos los keys son desconocidos', async () => {
    const pg = makePg();
    const repo = new UserRepository(pg);
    const result = await repo.updateById(1, { campoInventado: 'valor', otroInvalido: 123 });
    expect(result).toBeNull();
    expect(pg.query).not.toHaveBeenCalled();
  });

  it('deleteById devuelve true si se eliminó la fila', async () => {
    const repo = new UserRepository(makePg({ rows: [{ id: 1 }], rowCount: 1 }));
    const result = await repo.deleteById(1);
    expect(result).toBe(true);
  });

  it('deleteById devuelve false si no se eliminó ninguna fila', async () => {
    const repo = new UserRepository(makePg({ rows: [], rowCount: 0 }));
    const result = await repo.deleteById(99);
    expect(result).toBe(false);
  });

  it('listUsers devuelve el array de filas', async () => {
    const rows = [{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Bot' }];
    const repo = new UserRepository(makePg({ rows, rowCount: 2 }));
    const result = await repo.listUsers();
    expect(result).toEqual(rows);
  });

  it('setGoogleId llama a pg.query con los parámetros correctos', async () => {
    const pg = makePg({ rows: [], rowCount: 1 });
    const repo = new UserRepository(pg);
    await repo.setGoogleId(1, 'google-abc');
    expect(pg.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE'), ['google-abc', 1]);
  });

  it('createGoogleUser devuelve el usuario creado', async () => {
    const row = { id: 3, nombre: 'Google User', email: 'g@g.com', is_admin: false };
    const repo = new UserRepository(makePg({ rows: [row], rowCount: 1 }));
    const result = await repo.createGoogleUser({ nombre: 'Google User', email: 'g@g.com', passwordHash: 'h', googleId: 'gid' });
    expect(result).toEqual(row);
  });

  it('createGoogleUser devuelve null si no se insertó fila', async () => {
    const repo = new UserRepository(makePg({ rows: [], rowCount: 0 }));
    const result = await repo.createGoogleUser({ nombre: 'X', email: 'x@x.com', passwordHash: 'h', googleId: 'g' });
    expect(result).toBeNull();
  });
});
