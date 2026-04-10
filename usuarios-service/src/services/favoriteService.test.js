import { describe, it, expect, vi } from 'vitest';
import { FavoriteService } from './favoriteService.js';

function buildService(overrides = {}) {
  const favoriteRepository = {
    add: vi.fn(),
    listByUser: vi.fn(),
    delete: vi.fn(),
    listDistinctIdeess: vi.fn(),
    getStats: vi.fn(),
    deleteMany: vi.fn(),
    ...overrides.favoriteRepository,
  };

  const gasolinerasClient = {
    isConfigured: vi.fn().mockReturnValue(false),
    existsByIdeess: vi.fn(),
    ...overrides.gasolinerasClient,
  };

  const service = new FavoriteService({
    favoriteRepository,
    gasolinerasClient,
    validateOnWrite: overrides.validateOnWrite || false,
  });

  return { service, favoriteRepository, gasolinerasClient };
}

describe('FavoriteService', () => {
  it('evita insertar duplicado y responde 200', async () => {
    const { service } = buildService({
      favoriteRepository: { add: vi.fn().mockResolvedValue({ inserted: false, ideess: '123' }) },
    });

    const result = await service.addFavorite(1, '123');
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it('rechaza ideess vacío', async () => {
    const { service } = buildService();
    const result = await service.addFavorite(1, '');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('valida ideess contra gasolineras-service cuando está habilitado', async () => {
    const { service } = buildService({
      validateOnWrite: true,
      gasolinerasClient: {
        isConfigured: vi.fn().mockReturnValue(true),
        existsByIdeess: vi.fn().mockResolvedValue({ configured: true, exists: false }),
      },
    });

    const result = await service.addFavorite(1, 'XYZ');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(422);
  });

  it('reconciliación elimina favoritos obsoletos', async () => {
    const { service, favoriteRepository } = buildService({
      favoriteRepository: {
        listByUser: vi.fn().mockResolvedValue([{ ideess: 'A' }, { ideess: 'B' }]),
        deleteMany: vi.fn().mockResolvedValue(1),
      },
      gasolinerasClient: {
        isConfigured: vi.fn().mockReturnValue(true),
        existsByIdeess: vi.fn().mockImplementation(async (id) => ({ configured: true, exists: id !== 'B' })),
      },
    });

    const result = await service.reconcileFavorites(1);
    expect(favoriteRepository.deleteMany).toHaveBeenCalledWith(1, ['B']);
    expect(result.ok).toBe(true);
    expect(result.data.removed_count).toBe(1);
  });
});
