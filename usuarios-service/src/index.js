import Fastify from 'fastify';
import 'dotenv/config';
import { fastifyPostgres } from '@fastify/postgres';
import { authRoutes } from './routes/auth.js';
import { favoritesRoutes } from './routes/favorites.js';
import { healthRoutes } from './routes/health.js';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { errorHandler } from './middlewares/errorHandler.js';

const PORT = parseInt(process.env.PORT, 10) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// ⚠️ VALIDACIÓN CRÍTICA: JWT_SECRET debe estar definido y ser seguro
if (!process.env.JWT_SECRET) {
  throw new Error('❌ FATAL: JWT_SECRET no está definido en las variables de entorno');
}

if (process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️  WARNING: JWT_SECRET debería tener al menos 32 caracteres para máxima seguridad');
}

/**
 * Función principal para crear y configurar el servidor Fastify.
 */
async function buildServer() {
  const fastify = Fastify({
    logger: true
  });

  // 1. Plugins de seguridad básica
  fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false // Desactivar CSP para Swagger UI
  });

  // 2. Configuración de CORS
  await fastify.register(fastifyCors, {
    origin: process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',') 
      : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  // 3. Rate Limiting (protección contra fuerza bruta)
  await fastify.register(fastifyRateLimit, {
    global: false, // No aplicar globalmente, lo aplicamos por ruta
    max: 100, // Límite por defecto: 100 requests
    timeWindow: '15 minutes',
    cache: 10000,
    allowList: ['127.0.0.1', '::1'], // Whitelist localhost
    skipOnError: true, // Continuar si Redis falla (si se usa)
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true
    }
  });

  // 4. Configuración de JWT
  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  });

  // 5. Configuración de OpenAPI / Swagger
  fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Microservicio Usuarios',
        description: 'Gestión de usuarios, autenticación y favoritos con seguridad mejorada.',
        version: '1.0.0'
      },
      servers: [{ url: `http://localhost:${PORT}/api/usuarios` }],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      tags: [
        { name: 'Auth', description: 'Autenticación y gestión de usuarios' },
        { name: 'Favoritos', description: 'Gestión de gasolineras favoritas' },
        { name: 'Health', description: 'Endpoints de salud y monitoreo' }
      ]
    }
  });

  fastify.register(fastifySwaggerUI, {
    routePrefix: '/api-docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false
    }
  });

  // 6. Conexión a Base de Datos
  await fastify.register(fastifyPostgres, {
    connectionString: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
  });

  // Verificar conexión al iniciar
  try {
    const client = await fastify.pg.connect();
    fastify.log.info('✅ Conexión a PostgreSQL establecida correctamente');
    client.release();
  } catch (err) {
    fastify.log.error('❌ Error al conectar con PostgreSQL:', err);
    throw err;
  }

  // 7. Registro del manejador de errores global
  await fastify.register(errorHandler);

  // 8. Registro de rutas
  fastify.register(healthRoutes); // Health checks en la raíz
  fastify.register(authRoutes, { prefix: '/api/usuarios' });
  fastify.register(favoritesRoutes, { prefix: '/api/usuarios' });

  return fastify;
}

// Iniciar el servidor
const start = async () => {
  const server = await buildServer();
  try {
    await server.listen({ port: PORT, host: HOST });
    server.log.info(`Servidor de Usuarios escuchando en http://${HOST}:${PORT}`);
    server.log.info(`Documentación Swagger disponible en http://${HOST}:${PORT}/api-docs`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();