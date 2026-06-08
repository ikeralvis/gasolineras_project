import { describe, it, expect, vi } from 'vitest';
import { FavoriteRepository } from './favoriteRepository.js';

function makePg(result = { rows: [], rowCount: 0 }) {
  return { query: vi.fn().mockResolvedValue(result) };
}

describe('FavoriteRepository', () => {
  it('add devuelve inserted:true cuando se inserta correctamente', async () => {
    const pg = makePg({ rows: [{ ideess: '123' }], rowCount: 1 });
    const repo = new FavoriteRepository(pg);
    const result = await repo.add(1, '123');
    expect(result).toEqual({ inserted: true, ideess: '123' });
  });

  it('add devuelve inserted:false cuando hay conflicto (ON CONFLICT DO NOTHING)', async () => {
    const pg = makePg({ rows: [], rowCount: 0 });
    const repo = new FavoriteRepository(pg);
    const result = await repo.add(1, '123');
    expect(result.inserted).toBe(false);
    expect(result.ideess).toBe('123');
  });

  it('listByUser devuelve las filas de la query', async () => {
    const rows = [{ ideess: 'A', created_at: '2024-01-01' }, { ideess: 'B', created_at: '2024-01-02' }];
    const repo = new FavoriteRepository(makePg({ rows, rowCount: 2 }));
    const result = await repo.listByUser(1);
    expect(result).toEqual(rows);
  });

  it('delete devuelve true si se eliminó la fila', async () => {
    const repo = new FavoriteRepository(makePg({ rows: [{ ideess: 'X' }], rowCount: 1 }));
    const result = await repo.delete(1, 'X');
    expect(result).toBe(true);
  });

  it('delete devuelve false si no existía el favorito', async () => {
    const repo = new FavoriteRepository(makePg({ rows: [], rowCount: 0 }));
    const result = await repo.delete(1, 'inexistente');
    expect(result).toBe(false);
  });

  it('deleteMany devuelve 0 sin llamar a pg si la lista está vacía', async () => {
    const pg = makePg();
    const repo = new FavoriteRepository(pg);
    const result = await repo.deleteMany(1, []);
    expect(result).toBe(0);
    expect(pg.query).not.toHaveBeenCalled();
  });

  it('deleteMany devuelve 0 sin llamar a pg si no es un array', async () => {
    const pg = makePg();
    const repo = new FavoriteRepository(pg);
    const result = await repo.deleteMany(1, null);
    expect(result).toBe(0);
    expect(pg.query).not.toHaveBeenCalled();
  });

  it('deleteMany llama a pg.query y devuelve rowCount cuando hay elementos', async () => {
    const pg = makePg({ rows: [], rowCount: 2 });
    const repo = new FavoriteRepository(pg);
    const result = await repo.deleteMany(1, ['A', 'B']);
    expect(result).toBe(2);
    expect(pg.query).toHaveBeenCalledOnce();
  });

  it('listDistinctIdeess mapea las filas a strings de ideess', async () => {
    const rows = [{ ideess: 'A' }, { ideess: 'B' }, { ideess: 'C' }];
    const repo = new FavoriteRepository(makePg({ rows, rowCount: 3 }));
    const result = await repo.listDistinctIdeess();
    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('listDistinctIdeess devuelve array vacío si no hay favoritos', async () => {
    const repo = new FavoriteRepository(makePg({ rows: [], rowCount: 0 }));
    const result = await repo.listDistinctIdeess();
    expect(result).toEqual([]);
  });

  it('getStats mapea las filas con favorites_count convertido a Number', async () => {
    const rows = [
      { ideess: 'X', favorites_count: '5' },
      { ideess: 'Y', favorites_count: '3' },
    ];
    const repo = new FavoriteRepository(makePg({ rows, rowCount: 2 }));
    const result = await repo.getStats(10, 1);
    expect(result).toEqual([
      { ideess: 'X', favorites_count: 5 },
      { ideess: 'Y', favorites_count: 3 },
    ]);
    expect(typeof result[0].favorites_count).toBe('number');
  });

  it('getStats devuelve array vacío si no hay datos', async () => {
    const repo = new FavoriteRepository(makePg({ rows: [], rowCount: 0 }));
    const result = await repo.getStats(100, 1);
    expect(result).toEqual([]);
  });
});
