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
import fastifyCookie from '@fastify/cookie';
import { errorHandler } from './middlewares/errorHandler.js';
import fastifyCompress from '@fastify/compress';


const PORT = process.env.PORT || 3001; // Usa el puerto de Render o 3001 por defecto
const HOST = process.env.HOST || '0.0.0.0'; // Asegúrate de que escucha en 0.0.0.0

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
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'error' : 'info'
    }
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

  // 3. Compresión (gzip)
  await fastify.register(fastifyCompress, { global: true });

  // 4. Rate Limiting (protección contra fuerza bruta)
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

  // 5. Configuración de JWT
  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },
    // Buscar token en cookie si no hay header Authorization
    cookie: {
      cookieName: 'authToken',
      signed: false
    }
  });

  // 5.1 Plugin de Cookies (para httpOnly auth cookies)
  await fastify.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET,
    parseOptions: {}
  });

  // 6. Configuración de OpenAPI / Swagger
  fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Microservicio Usuarios',
        description: 'Gestión de usuarios, autenticación y favoritos con seguridad mejorada.',
        version: '1.0.0'
      },
      servers: [
        { url: process.env.USUARIOS_URL || `http://localhost:${PORT}`, description: 'Producción o Desarrollo Local' }
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
        { name: 'Auth', description: 'Autenticación y gestión de usuarios' },
        { name: 'Favoritos', description: 'Gestión de gasolineras favoritas' },
        { name: 'Health', description: 'Endpoints de salud y monitoreo' }
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

  // 📋 Exponer OpenAPI JSON para agregación en el Gateway
  fastify.get('/openapi.json', async (request, reply) => {
    return reply.send(fastify.swagger());
  });

  // 7. Conexión a Base de Datos
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('❌ FATAL: DATABASE_URL no está definido en las variables de entorno');
  }
  // Ensure sslmode=require for Neon / cloud Postgres
  let connectionString = databaseUrl;
  if (!databaseUrl.includes('sslmode')) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    connectionString = `${databaseUrl}${separator}sslmode=require`;
  }
  const pgConfig = {
    connectionString,
    ssl: { rejectUnauthorized: false },
  };
  await fastify.register(fastifyPostgres, pgConfig);


  // Verificar conexión al iniciar
  try {
    const client = await fastify.pg.connect();
    fastify.log.info('✅ Conexión a PostgreSQL establecida correctamente');
    client.release();
  } catch (err) {
    fastify.log.error('❌ Error al conectar con PostgreSQL:', err);
    throw err;
  }

  // 8. Registro del manejador de errores global
  await fastify.register(errorHandler);

  // 9. Registro de rutas
  fastify.register(healthRoutes); // Health checks en la raíz
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