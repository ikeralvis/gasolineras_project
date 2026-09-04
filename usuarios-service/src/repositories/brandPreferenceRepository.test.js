import { describe, it, expect, vi } from 'vitest';
import { BrandPreferenceRepository } from './brandPreferenceRepository.js';

function makePg(result = { rows: [], rowCount: 0 }) {
  return { query: vi.fn().mockResolvedValue(result) };
}

describe('BrandPreferenceRepository', () => {
  it('upsert inserta y devuelve la fila creada', async () => {
    const row = { marca: 'repsol', es_socio: true, created_at: '2024-01-01' };
    const pg = makePg({ rows: [row], rowCount: 1 });
    const repo = new BrandPreferenceRepository(pg);
    const result = await repo.upsert(1, 'repsol', true);
    expect(result).toEqual(row);
    expect(pg.query).toHaveBeenCalledOnce();
  });

  it('upsert actualiza es_socio en conflicto (ON CONFLICT DO UPDATE)', async () => {
    const row = { marca: 'repsol', es_socio: false, created_at: '2024-01-01' };
    const pg = makePg({ rows: [row], rowCount: 1 });
    const repo = new BrandPreferenceRepository(pg);
    const result = await repo.upsert(1, 'repsol', false);
    expect(result.es_socio).toBe(false);
  });

  it('listByUser devuelve las filas de la query', async () => {
    const rows = [
      { marca: 'repsol', es_socio: true, created_at: '2024-01-01' },
      { marca: 'cepsa', es_socio: false, created_at: '2024-01-02' },
    ];
    const repo = new BrandPreferenceRepository(makePg({ rows, rowCount: 2 }));
    const result = await repo.listByUser(1);
    expect(result).toEqual(rows);
  });

  it('delete devuelve true si se eliminó la fila', async () => {
    const repo = new BrandPreferenceRepository(makePg({ rows: [{ marca: 'repsol' }], rowCount: 1 }));
    const result = await repo.delete(1, 'repsol');
    expect(result).toBe(true);
  });

  it('delete devuelve false si no existía la preferencia', async () => {
    const repo = new BrandPreferenceRepository(makePg({ rows: [], rowCount: 0 }));
    const result = await repo.delete(1, 'inexistente');
    expect(result).toBe(false);
  });
});
