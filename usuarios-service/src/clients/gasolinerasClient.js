export class GasolinerasClient {
  constructor({ baseUrl, timeoutMs = 4000 }) {
    this.baseUrl = (baseUrl || '').replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  isConfigured() {
    return Boolean(this.baseUrl);
  }

  async existsByIdeess(ideess) {
    if (!this.isConfigured()) {
      return { configured: false, exists: null };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/gasolineras/${encodeURIComponent(ideess)}`, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (response.status === 404) {
        return { configured: true, exists: false };
      }

      if (!response.ok) {
        return { configured: true, exists: null };
      }

      return { configured: true, exists: true };
    } catch {
      return { configured: true, exists: null };
    } finally {
      clearTimeout(timeout);
    }
  }
}
