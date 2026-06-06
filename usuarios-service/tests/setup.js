/**
 * Vitest setup file — se ejecuta ANTES de cualquier import de módulos de src/.
 * Garantiza que env.js no lance por falta de JWT_SECRET o DATABASE_URL.
 */

// Las variables reales llegan por GitHub Secrets o por el entorno local CI.
// Los valores por defecto solo se usan si no están ya definidos.
process.env.JWT_SECRET ??= 'integration-test-jwt-secret-minimum-32-chars';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/testdb';
process.env.COOKIE_SECRET ??= 'integration-test-cookie-secret-32ch';
process.env.NODE_ENV = 'test';
process.env.PORT ??= '3099';
process.env.USE_INTERNAL_API_SECRET = 'true';
process.env.INTERNAL_API_SECRET ??= 'test-internal-secret';
process.env.GASOLINERAS_SERVICE_URL ??= 'http://localhost:9999';
process.env.FAVORITES_VALIDATE_ON_WRITE = 'false';
