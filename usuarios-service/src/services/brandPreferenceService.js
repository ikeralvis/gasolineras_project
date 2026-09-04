const MAX_MARCA_LENGTH = 50;

export class BrandPreferenceService {
  constructor({ brandPreferenceRepository }) {
    this.brandPreferenceRepository = brandPreferenceRepository;
  }

  async setBrandPreference(userId, marca, esSocio) {
    const normalized = String(marca || '').trim();
    if (!normalized) {
      return { ok: false, statusCode: 400, error: 'marca es requerida' };
    }
    if (normalized.length > MAX_MARCA_LENGTH) {
      return { ok: false, statusCode: 400, error: `marca supera ${MAX_MARCA_LENGTH} caracteres` };
    }

    const row = await this.brandPreferenceRepository.upsert(userId, normalized, Boolean(esSocio));
    return { ok: true, statusCode: 200, data: row };
  }

  async listBrandPreferences(userId) {
    const rows = await this.brandPreferenceRepository.listByUser(userId);
    return { ok: true, statusCode: 200, data: rows };
  }

  async deleteBrandPreference(userId, marca) {
    const removed = await this.brandPreferenceRepository.delete(userId, marca);
    if (!removed) {
      return { ok: false, statusCode: 404, error: 'Marca favorita no encontrada.' };
    }
    return { ok: true, statusCode: 204, data: null };
  }
}
