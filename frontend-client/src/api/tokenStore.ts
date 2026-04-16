/**
 * tokenStore – persiste el JWT en localStorage y en memoria.
 *
 * Por qué existe:
 * Safari en iOS bloquea las cookies de terceros (ITP) cuando el frontend
 * (tankgo.dev) y la API (api.tankgo.dev / *.run.app) son orígenes distintos.
 * Guardar el JWT en localStorage y enviarlo como "Authorization: Bearer <token>"
 * evita completamente ese problema, ya que los headers no están sujetos a ITP.
 *
 * La cookie httpOnly sigue configurándose en el gateway como fallback para
 * navegadores de escritorio y para sesiones sin token en localStorage.
 */

const STORAGE_KEY = 'tankgo_auth_token';

// Caché en memoria para evitar lecturas de localStorage en cada request
let _mem: string | null = null;

/** Guarda el token en memoria y en localStorage. */
export function setAuthToken(token: string | null): void {
  _mem = token;
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // En entornos con storage restringido (privado/iframe) ignoramos el error
  }
}

/** Lee el token desde memoria; si no hay, intenta localStorage. */
export function getAuthToken(): string | null {
  if (_mem) return _mem;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      _mem = stored; // calentar caché en memoria
      return stored;
    }
  } catch {
    // ignorar
  }
  return null;
}

/** Elimina el token de memoria y de localStorage. */
export function clearAuthToken(): void {
  _mem = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignorar
  }
}
