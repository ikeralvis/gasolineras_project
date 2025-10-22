import Fastify from 'fastify';
import 'dotenv/config';
import { dbPlugin } from './db.js';
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
    // @fastify/jwt decora request con 'user' automáticamente
    // Si no pones payload.id, el user solo tendrá id, email, is_admin
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

  // 3. Conexión a Base de Datos
  fastify.register(dbPlugin);

  // 4. Registro de rutas
  // Prefijo principal /api/usuarios, como se indica en el resumen
  fastify.register(async (instance, opts) => {
    // Rutas de autenticación (register, login, me, /)
    instance.register(authRoutes);
    // Rutas de favoritos
    instance.register(favoritesRoutes);
  }, { prefix: '/api/usuarios' });

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