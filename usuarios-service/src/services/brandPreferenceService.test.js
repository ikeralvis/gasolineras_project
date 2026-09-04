import { describe, it, expect, vi } from 'vitest';
import { BrandPreferenceService } from './brandPreferenceService.js';

function buildService(overrides = {}) {
  const brandPreferenceRepository = {
    upsert: vi.fn(),
    listByUser: vi.fn(),
    delete: vi.fn(),
    ...overrides.brandPreferenceRepository,
  };

  const service = new BrandPreferenceService({ brandPreferenceRepository });

  return { service, brandPreferenceRepository };
}

describe('BrandPreferenceService', () => {
  it('rechaza marca vacía', async () => {
    const { service } = buildService();
    const result = await service.setBrandPreference(1, '   ', false);
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('rechaza marca demasiado larga', async () => {
    const { service } = buildService();
    const result = await service.setBrandPreference(1, 'a'.repeat(51), false);
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('setBrandPreference guarda la marca normalizada (trim) y devuelve 200', async () => {
    const { service, brandPreferenceRepository } = buildService({
      brandPreferenceRepository: {
        upsert: vi.fn().mockResolvedValue({ marca: 'repsol', es_socio: true }),
      },
    });
    const result = await service.setBrandPreference(1, '  repsol  ', true);
    expect(brandPreferenceRepository.upsert).toHaveBeenCalledWith(1, 'repsol', true);
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.data.marca).toBe('repsol');
  });

  it('setBrandPreference convierte es_socio a booleano', async () => {
    const { service, brandPreferenceRepository } = buildService({
      brandPreferenceRepository: {
        upsert: vi.fn().mockResolvedValue({ marca: 'repsol', es_socio: false }),
      },
    });
    await service.setBrandPreference(1, 'repsol', undefined);
    expect(brandPreferenceRepository.upsert).toHaveBeenCalledWith(1, 'repsol', false);
  });

  it('listBrandPreferences devuelve las marcas del usuario', async () => {
    const rows = [{ marca: 'repsol', es_socio: true }];
    const { service } = buildService({
      brandPreferenceRepository: { listByUser: vi.fn().mockResolvedValue(rows) },
    });
    const result = await service.listBrandPreferences(1);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(rows);
  });

  it('deleteBrandPreference retorna 204 cuando existía', async () => {
    const { service } = buildService({
      brandPreferenceRepository: { delete: vi.fn().mockResolvedValue(true) },
    });
    const result = await service.deleteBrandPreference(1, 'repsol');
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(204);
  });

  it('deleteBrandPreference retorna 404 cuando no existía', async () => {
    const { service } = buildService({
      brandPreferenceRepository: { delete: vi.fn().mockResolvedValue(false) },
    });
    const result = await service.deleteBrandPreference(1, 'repsol');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
  });
});
