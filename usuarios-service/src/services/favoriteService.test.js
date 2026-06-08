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

  it('addFavorite exitoso retorna 201', async () => {
    const { service } = buildService({
      favoriteRepository: { add: vi.fn().mockResolvedValue({ inserted: true, ideess: '456' }) },
    });
    const result = await service.addFavorite(1, '456');
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(201);
    expect(result.data.ideess).toBe('456');
  });

  it('listFavorites devuelve lista de favoritos del usuario', async () => {
    const rows = [{ ideess: 'A' }, { ideess: 'B' }];
    const { service } = buildService({
      favoriteRepository: { listByUser: vi.fn().mockResolvedValue(rows) },
    });
    const result = await service.listFavorites(1);
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual(rows);
  });

  it('deleteFavorite retorna 204 cuando el favorito existe', async () => {
    const { service } = buildService({
      favoriteRepository: { delete: vi.fn().mockResolvedValue(true) },
    });
    const result = await service.deleteFavorite(1, 'X');
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(204);
  });

  it('deleteFavorite retorna 404 cuando el favorito no existe', async () => {
    const { service } = buildService({
      favoriteRepository: { delete: vi.fn().mockResolvedValue(false) },
    });
    const result = await service.deleteFavorite(1, 'X');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it('listAllIdeess devuelve count e ideess distintos', async () => {
    const { service } = buildService({
      favoriteRepository: { listDistinctIdeess: vi.fn().mockResolvedValue(['A', 'B', 'C']) },
    });
    const result = await service.listAllIdeess();
    expect(result.ok).toBe(true);
    expect(result.data.count).toBe(3);
    expect(result.data.ideess).toEqual(['A', 'B', 'C']);
  });

  it('favoritesStats aplica parámetros y devuelve datos', async () => {
    const stations = [{ ideess: 'X', count: 5 }];
    const { service, favoriteRepository } = buildService({
      favoriteRepository: { getStats: vi.fn().mockResolvedValue(stations) },
    });
    const result = await service.favoritesStats(10, 2);
    expect(result.ok).toBe(true);
    expect(result.data.top_n).toBe(10);
    expect(result.data.min_favorites).toBe(2);
    expect(result.data.stations).toEqual(stations);
    expect(favoriteRepository.getStats).toHaveBeenCalledWith(10, 2);
  });

  it('favoritesStats usa valores por defecto cuando recibe NaN', async () => {
    const { service, favoriteRepository } = buildService({
      favoriteRepository: { getStats: vi.fn().mockResolvedValue([]) },
    });
    await service.favoritesStats(Number.NaN, Number.NaN);
    const [topN, minFav] = favoriteRepository.getStats.mock.calls[0];
    expect(topN).toBe(500);
    expect(minFav).toBe(1);
  });

  it('reconcileFavorites sin favoritos no consulta al cliente externo', async () => {
    const { service, gasolinerasClient } = buildService({
      favoriteRepository: { listByUser: vi.fn().mockResolvedValue([]) },
      gasolinerasClient: {
        isConfigured: vi.fn().mockReturnValue(true),
        existsByIdeess: vi.fn(),
      },
    });
    const result = await service.reconcileFavorites(1);
    expect(gasolinerasClient.existsByIdeess).not.toHaveBeenCalled();
    expect(result.data.removed_count).toBe(0);
  });
});
