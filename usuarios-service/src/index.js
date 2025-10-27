import Fastify from 'fastify';
import 'dotenv/config';
import { fastifyPostgres } from '@fastify/postgres';
import { authRoutes } from './routes/auth.js';
import { favoritesRoutes } from './routes/favorites.js';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';

const PORT = parseInt(process.env.PORT, 10) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Función principal para crear y configurar el servidor Fastify.
 */
async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'error' : 'info'
    }
  });

  // ========================================
  // 🛡️ PLUGINS DE SEGURIDAD
  // ========================================
  
  // Helmet: Headers de seguridad HTTP
  fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false // Desactivar para Swagger UI
  });

  // CORS: Permitir peticiones cross-origin
  fastify.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN || '*', // En producción: especificar dominios
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  // ========================================
  // 🔐 JWT
  // ========================================
  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  });

  // ========================================
  // 📄 SWAGGER / OPENAPI
  // ========================================
  fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Microservicio de Usuarios',
        description: 'API REST para gestión de usuarios, autenticación JWT y favoritos de gasolineras.',
        version: '1.0.0',
        contact: {
          name: 'Equipo de Desarrollo',
          email: 'dev@gasolineras.com'
        }
      },
      servers: [
        { url: `http://localhost:${PORT}`, description: 'Desarrollo Local' },
        { url: `http://localhost:8080`, description: 'Gateway' }
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Ingresa el token JWT obtenido del endpoint /login'
          }
        }
      },
      tags: [
        { name: 'Autenticación', description: 'Registro y login de usuarios' },
        { name: 'Perfil', description: 'Gestión del perfil de usuario' },
        { name: 'Favoritos', description: 'Gestión de gasolineras favoritas' },
        { name: 'Admin', description: 'Endpoints administrativos (requieren rol admin)' }
      ]
    }
  });

  fastify.register(fastifySwaggerUI, {
    routePrefix: '/api-docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true
    },
    staticCSP: true,
    transformStaticCSP: (header) => header
  });

  // ========================================
  // 🗄️ BASE DE DATOS
  // ========================================
  await fastify.register(fastifyPostgres, {
    connectionString: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
  });

  // Verificar conexión
  try {
    const client = await fastify.pg.connect();
    fastify.log.info('✅ Conexión a PostgreSQL establecida');
    client.release();
  } catch (err) {
    fastify.log.error('❌ Error al conectar con PostgreSQL:', err);
    throw err;
  }

  // ========================================
  // 🏥 HEALTH CHECK (PÚBLICO)
  // ========================================
  fastify.get('/api/usuarios/health', async (request, reply) => {
    try {
      const client = await fastify.pg.connect();
      client.release();
      return {
        status: 'UP',
        service: 'usuarios',
        database: 'connected',
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return reply.code(503).send({
        status: 'DOWN',
        service: 'usuarios',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // ========================================
  // 📍 RUTAS
  // ========================================
  fastify.register(authRoutes, { prefix: '/api/usuarios' });
  fastify.register(favoritesRoutes, { prefix: '/api/usuarios' });

  // Ruta raíz
  fastify.get('/', async () => ({
    service: 'usuarios-service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      docs: '/api-docs',
      health: '/api/usuarios/health',
      base: '/api/usuarios'
    }
  }));

  return fastify;
}

// ========================================
// 🚀 INICIAR SERVIDOR
// ========================================
const start = async () => {
  const server = await buildServer();
  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   👤 Microservicio de Usuarios                           ║
║                                                           ║
║   📍 URL:          http://${HOST}:${PORT}                     ║
║   📄 Swagger:      http://${HOST}:${PORT}/api-docs            ║
║   🏥 Health:       http://${HOST}:${PORT}/api/usuarios/health ║
║                                                           ║
║   🗄️  PostgreSQL:  Conectado ✅                          ║
║   🔐 JWT:          Configurado ✅                        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();