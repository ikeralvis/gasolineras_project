/**
 * Construye una instancia Fastify de test conectada a la BD real.
 * NO importa src/index.js (tiene top-level await que levanta el servidor).
 * Usa los mismos plugins y rutas que producción.
 */
import Fastify from 'fastify';
import { fastifyPostgres } from '@fastify/postgres';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';

import { authRoutes } from '../../src/routes/auth.js';
import { favoritesRoutes } from '../../src/routes/favorites.js';
import { healthRoutes } from '../../src/routes/health.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { buildInternalAuthHook } from '../../src/hooks/internalAuthHook.js';
import { UserRepository } from '../../src/repositories/userRepository.js';
import { FavoriteRepository } from '../../src/repositories/favoriteRepository.js';
import { AuthService } from '../../src/services/authService.js';
import { UserService } from '../../src/services/userService.js';
import { FavoriteService } from '../../src/services/favoriteService.js';
import { GasolinerasClient } from '../../src/clients/gasolinerasClient.js';

export async function buildTestServer() {
  const jwtSecret = process.env.JWT_SECRET;
  const databaseUrl = process.env.DATABASE_URL;
  const internalApiSecret = process.env.INTERNAL_API_SECRET || 'test-internal-secret';

  const fastify = Fastify({ logger: false });

  // JWT
  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
    sign: { expiresIn: '1h' },
    cookie: { cookieName: 'authToken', signed: false },
  });

  // Cookie
  await fastify.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || jwtSecret,
  });

  // Rate limit — mantiene la misma config que producción (max=5 por ruta de auth)
  await fastify.register(fastifyRateLimit, {
    global: false,
    max: 5,
    timeWindow: '15 minutes',
    // Solo localhost está en la lista blanca; los tests con remoteAddress externo sí aplican
    allowList: ['127.0.0.1', '::1'],
    skipOnError: false,
  });

  // Postgres — sin SSL (servicio local en CI; postgres:15 en GitHub Actions no soporta SSL)
  await fastify.register(fastifyPostgres, {
    connectionString: databaseUrl,
    ssl: false,
  });

  // Verificar conexión
  const client = await fastify.pg.connect();
  await client.query('SELECT 1;');
  client.release();

  // Servicios
  const userRepository = new UserRepository(fastify.pg);
  const favoriteRepository = new FavoriteRepository(fastify.pg);
  const gasolinerasClient = new GasolinerasClient({
    baseUrl: process.env.GASOLINERAS_SERVICE_URL || 'http://localhost:9999',
  });

  const authService = new AuthService({
    userRepository,
    jwt: fastify.jwt,
    jwtExpiresIn: '1h',
  });
  const userService = new UserService({ userRepository });
  const favoriteService = new FavoriteService({
    favoriteRepository,
    gasolinerasClient,
    validateOnWrite: false,
  });

  const testSettings = {
    nodeEnv: 'test',
    useInternalApiSecret: true,
    internalApiSecret,
  };

  await fastify.register(errorHandler);
  fastify.decorate('settings', testSettings);
  fastify.decorate('services', { authService, userService, favoriteService });
  fastify.decorate(
    'verifyInternalSecret',
    buildInternalAuthHook({ fastify, settings: testSettings }),
  );

  fastify.register(healthRoutes);
  fastify.register(authRoutes, { prefix: '/api/usuarios' });
  fastify.register(favoritesRoutes, { prefix: '/api/usuarios' });

  await fastify.ready();
  return fastify;
}
