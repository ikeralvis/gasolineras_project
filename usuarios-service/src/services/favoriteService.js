export class FavoriteService {
  constructor({ favoriteRepository, gasolinerasClient, validateOnWrite = false }) {
    this.favoriteRepository = favoriteRepository;
    this.gasolinerasClient = gasolinerasClient;
    this.validateOnWrite = validateOnWrite;
  }

  async addFavorite(userId, ideess) {
    const normalized = String(ideess || '').trim();
    if (!normalized) {
      return { ok: false, statusCode: 400, error: 'ideess es requerido' };
    }

    if (this.validateOnWrite && this.gasolinerasClient.isConfigured()) {
      const check = await this.gasolinerasClient.existsByIdeess(normalized);
      if (check.exists === false) {
        return {
          ok: false,
          statusCode: 422,
          error: 'IDEESS inválido o no existe en gasolineras-service',
        };
      }
    }

    const result = await this.favoriteRepository.add(userId, normalized);
    if (!result.inserted) {
      return { ok: true, statusCode: 200, data: { message: 'Favorito ya existe.', ideess: normalized } };
    }
    return { ok: true, statusCode: 201, data: { message: 'Favorito añadido.', ideess: result.ideess } };
  }

  async listFavorites(userId) {
    const rows = await this.favoriteRepository.listByUser(userId);
    return { ok: true, statusCode: 200, data: rows };
  }

  async deleteFavorite(userId, ideess) {
    const removed = await this.favoriteRepository.delete(userId, ideess);
    if (!removed) {
      return { ok: false, statusCode: 404, error: 'Favorito no encontrado.' };
    }
    return { ok: true, statusCode: 200, data: { message: 'Favorito eliminado correctamente.' } };
  }

  async listAllIdeess() {
    const ideess = await this.favoriteRepository.listDistinctIdeess();
    return { ok: true, statusCode: 200, data: { count: ideess.length, ideess } };
  }

  async favoritesStats(topN, minFavorites) {
    const safeTopN = Number.isNaN(topN) ? 500 : Math.min(Math.max(topN, 1), 5000);
    const safeMinFavorites = Number.isNaN(minFavorites) ? 1 : Math.min(Math.max(minFavorites, 1), 100000);
    const stations = await this.favoriteRepository.getStats(safeTopN, safeMinFavorites);
    return {
      ok: true,
      statusCode: 200,
      data: {
        count: stations.length,
        top_n: safeTopN,
        min_favorites: safeMinFavorites,
        stations,
      },
    };
  }

  // Resiliencia ante IDs obsoletos: endpoint explícito de reconciliación.
  async reconcileFavorites(userId) {
    if (!this.gasolinerasClient.isConfigured()) {
      return {
        ok: true,
        statusCode: 200,
        data: {
          reconciled: false,
          reason: 'gasolineras-service no configurado',
          removed_count: 0,
          removed_ideess: [],
        },
      };
    }

    const favorites = await this.favoriteRepository.listByUser(userId);
    if (favorites.length === 0) {
      return {
        ok: true,
        statusCode: 200,
        data: { reconciled: true, removed_count: 0, removed_ideess: [] },
      };
    }

    const stale = [];
    for (const fav of favorites) {
      const check = await this.gasolinerasClient.existsByIdeess(fav.ideess);
      if (check.exists === false) {
        stale.push(fav.ideess);
      }
    }

    const removedCount = await this.favoriteRepository.deleteMany(userId, stale);

    return {
      ok: true,
      statusCode: 200,
      data: {
        reconciled: true,
        removed_count: removedCount,
        removed_ideess: stale,
      },
    };
  }
}
