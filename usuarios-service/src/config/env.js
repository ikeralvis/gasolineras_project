import 'dotenv/config';

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'y'].includes(String(value).toLowerCase());
}

function required(name) {
  const value = (process.env[name] || '').trim();
  if (!value) {
    throw new Error(`FATAL: ${name} no está definido`);
  }
  return value;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  // eslint-disable-next-line no-console
  console.warn('WARNING: JWT_SECRET debería tener al menos 32 caracteres');
}

export const settings = {
  nodeEnv: (process.env.NODE_ENV || 'development').trim().toLowerCase(),
  host: (process.env.HOST || '0.0.0.0').trim(),
  port: Number.parseInt(process.env.PORT || '8080', 10),

  databaseUrl: required('DATABASE_URL'),
  jwtSecret,
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN || '7d').trim(),
  cookieSecret: (process.env.COOKIE_SECRET || jwtSecret).trim(),

  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),

  useInternalApiSecret: asBool(process.env.USE_INTERNAL_API_SECRET, false),
  internalApiSecret: (process.env.INTERNAL_API_SECRET || '').trim(),

  gasolinerasServiceUrl: (process.env.GASOLINERAS_SERVICE_URL || '').trim(),
  favoritesValidateOnWrite: asBool(process.env.FAVORITES_VALIDATE_ON_WRITE, false),
};

if (settings.useInternalApiSecret && !settings.internalApiSecret) {
  throw new Error('FATAL: USE_INTERNAL_API_SECRET=true pero INTERNAL_API_SECRET no está definido');
}

if (!Number.isFinite(settings.port) || settings.port <= 0) {
  throw new Error('FATAL: PORT inválido');
}
