import Fastify from 'fastify';
import { fastifyPostgres } from '@fastify/postgres';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCookie from '@fastify/cookie';
import fastifyCompress from '@fastify/compress';

import { settings } from './config/env.js';
import { authRoutes } from './routes/auth.js';
import { favoritesRoutes } from './routes/favorites.js';
import { healthRoutes } from './routes/health.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { buildInternalAuthHook } from './hooks/internalAuthHook.js';

import { UserRepository } from './repositories/userRepository.js';
import { FavoriteRepository } from './repositories/favoriteRepository.js';
import { AuthService } from './services/authService.js';
import { UserService } from './services/userService.js';
import { FavoriteService } from './services/favoriteService.js';
import { GasolinerasClient } from './clients/gasolinerasClient.js';

function buildPgConnectionString(databaseUrl) {
  if (databaseUrl.includes('sslmode=')) return databaseUrl;
  const separator = databaseUrl.includes('?') ? '&' : '?';
  return `${databaseUrl}${separator}sslmode=require`;
}

async function setupDatabase(fastify) {
  await fastify.register(fastifyPostgres, {
    connectionString: buildPgConnectionString(settings.databaseUrl),
    ssl: { rejectUnauthorized: false },
  });

  const client = await fastify.pg.connect();
  await client.query('SELECT 1;');
  client.release();
}

function buildContainer(fastify) {
  const userRepository = new UserRepository(fastify.pg);
  const favoriteRepository = new FavoriteRepository(fastify.pg);
  const gasolinerasClient = new GasolinerasClient({ baseUrl: settings.gasolinerasServiceUrl });

  const authService = new AuthService({
    userRepository,
    jwt: fastify.jwt,
    jwtExpiresIn: settings.jwtExpiresIn,
  });

  const userService = new UserService({ userRepository });

  const favoriteService = new FavoriteService({
    favoriteRepository,
    gasolinerasClient,
    validateOnWrite: settings.favoritesValidateOnWrite,
  });

  return {
    authService,
    userService,
    favoriteService,
  };
}

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: settings.nodeEnv === 'production' ? 'info' : 'debug',
    },
  });

  await fastify.register(fastifyHelmet, { contentSecurityPolicy: false });
  await fastify.register(fastifyCors, {
    origin: settings.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await fastify.register(fastifyCompress, { global: true });
  await fastify.register(fastifyRateLimit, {
    global: false,
    max: 100,
    timeWindow: '15 minutes',
    cache: 10000,
    allowList: ['127.0.0.1', '::1'],
    skipOnError: true,
  });

  await fastify.register(fastifyJwt, {
    secret: settings.jwtSecret,
    sign: { expiresIn: settings.jwtExpiresIn },
    cookie: { cookieName: 'authToken', signed: false },
  });

  await fastify.register(fastifyCookie, {
    secret: settings.cookieSecret,
    parseOptions: {},
  });

  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Microservicio Usuarios',
        description: 'Gestión de registro, login y favoritos',
        version: '2.0.0',
      },
      servers: [{ url: process.env.USUARIOS_URL || `http://localhost:${settings.port}` }],
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  await fastify.register(fastifySwaggerUI, {
    routePrefix: '/api-docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, persistAuthorization: true },
  });

  fastify.get('/openapi.json', async (request, reply) => reply.send(fastify.swagger()));

  await setupDatabase(fastify);

  await fastify.register(errorHandler);

  fastify.decorate('settings', settings);
  fastify.decorate('services', buildContainer(fastify));
  fastify.decorate('verifyInternalSecret', buildInternalAuthHook({ fastify, settings }));

  fastify.register(healthRoutes);
  fastify.register(authRoutes, { prefix: '/api/usuarios' });
  fastify.register(favoritesRoutes, { prefix: '/api/usuarios' });

  fastify.get('/', async () => ({
    service: 'usuarios-service',
    version: '2.0.0',
    status: 'running',
    docs: '/api-docs',
  }));

  return fastify;
}

const server = await buildServer();
try {
  await server.listen({ port: settings.port, host: settings.host });
  server.log.info(`usuarios-service escuchando en ${settings.host}:${settings.port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
