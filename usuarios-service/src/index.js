import Fastify from 'fastify';
import 'dotenv/config';
import { fastifyPostgres } from '@fastify/postgres';
import { authRoutes } from './routes/auth.js';
import { favoritesRoutes } from './routes/favorites.js';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import fastifyHelmet from '@fastify/helmet';

const PORT = parseInt(process.env.PORT, 10) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Función principal para crear y configurar el servidor Fastify.
 */
async function buildServer() {
  const fastify = Fastify({
    logger: true
  });

  // Plugins de seguridad y configuración
  fastify.register(fastifyHelmet);

  // 1. Configuración de JWT
  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  });

  // 2. Configuración de OpenAPI / Swagger
  fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Microservicio Usuarios',
        description: 'Gestión de usuarios, autenticación y favoritos.',
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
      security: [
        {
          BearerAuth: []
        }
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

  // 3. Conexión a Base de Datos (DIRECTAMENTE, sin wrapper)
  await fastify.register(fastifyPostgres, {
    connectionString: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
  });

  // Verificar conexión (opcional pero útil)
  try {
    const client = await fastify.pg.connect();
    fastify.log.info('✅ Conexión a PostgreSQL establecida');
    client.release();
  } catch (err) {
    fastify.log.error('❌ Error al conectar con PostgreSQL:', err);
    throw err;
  }

  // 4. Registro de rutas (ahora tienen acceso a fastify.pg)
  fastify.register(authRoutes, { prefix: '/api/usuarios' });
  fastify.register(favoritesRoutes, { prefix: '/api/usuarios' });

  // Health check endpoint
  fastify.get('/api/usuarios/health', async (request, reply) => {
    try {
      // Verificar conexión a base de datos
      const client = await fastify.pg.connect();
      client.release();
      return { status: 'UP', service: 'usuarios', database: 'connected' };
    } catch (err) {
      return reply.code(503).send({ status: 'DOWN', service: 'usuarios', error: err.message });
    }
  });

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