import { adminOnlyHook, verifyJwt } from '../hooks/authHooks.js';

export async function authRoutes(fastify) {
  const { authService, userService } = fastify.services;
  const verifyInternalSecret = fastify.verifyInternalSecret;

  fastify.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Registrar usuario',
      body: {
        type: 'object',
        required: ['nombre', 'email', 'password'],
        properties: {
          nombre: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          modelo_coche: { type: 'string', nullable: true },
          tipo_combustible_coche: {
            type: 'string',
            enum: ['gasolina', 'diesel', 'electrico', 'hibrido'],
            nullable: true,
          },
        },
        additionalProperties: false,
      },
    },
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const result = await authService.register(request.body);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(result.statusCode).send(result.data);
  });

  fastify.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Iniciar sesión',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const result = await authService.login(request.body);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });

    const token = result.data.token;
    const isProduction = fastify.settings.nodeEnv === 'production';
    reply.setCookie('authToken', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.code(200).send({ token, cookieSet: true });
  });

  fastify.post('/logout', {
    schema: {
      tags: ['Auth'],
      summary: 'Cerrar sesión',
    },
  }, async (request, reply) => {
    reply.clearCookie('authToken', { path: '/' });
    return reply.code(200).send({ message: 'Sesión cerrada' });
  });

  fastify.get('/me', {
    schema: {
      tags: ['Auth'],
      summary: 'Perfil actual',
      security: [{ BearerAuth: [] }],
    },
    onRequest: [verifyJwt],
  }, async (request, reply) => {
    const result = await userService.getMe(request.user.id);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(result.statusCode).send(result.data);
  });

  fastify.patch('/me', {
    schema: {
      tags: ['Auth'],
      summary: 'Actualizar perfil actual',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          nombre: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          combustible_favorito: {
            type: 'string',
            enum: ['Precio Gasolina 95 E5', 'Precio Gasolina 98 E5', 'Precio Gasoleo A', 'Precio Gasoleo B', 'Precio Gasoleo Premium'],
          },
          modelo_coche: { type: 'string', minLength: 1, maxLength: 255 },
          tipo_combustible_coche: { type: 'string', enum: ['gasolina', 'diesel', 'electrico', 'hibrido'] },
        },
        additionalProperties: false,
        minProperties: 1,
      },
    },
    onRequest: [verifyJwt],
  }, async (request, reply) => {
    const result = await userService.updateMe(request.user.id, request.body);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(result.statusCode).send(result.data);
  });

  fastify.delete('/me', {
    schema: {
      tags: ['Auth'],
      summary: 'Eliminar cuenta actual',
      security: [{ BearerAuth: [] }],
    },
    onRequest: [verifyJwt],
  }, async (request, reply) => {
    const result = await userService.deleteMe(request.user.id);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(result.statusCode).send(result.data);
  });

  fastify.get('/', {
    schema: {
      tags: ['Auth'],
      summary: 'Listar usuarios (solo admin)',
      security: [{ BearerAuth: [] }],
    },
    onRequest: [verifyJwt, adminOnlyHook],
  }, async (request, reply) => {
    const result = await userService.listUsers();
    return reply.code(result.statusCode).send(result.data);
  });

  fastify.post('/google/internal', {
    schema: {
      tags: ['Auth'],
      summary: 'OAuth interno (gateway)',
      body: {
        type: 'object',
        required: ['google_id', 'email', 'name'],
        properties: {
          google_id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
        },
      },
    },
    onRequest: [verifyInternalSecret],
  }, async (request, reply) => {
    const result = await authService.loginOrCreateGoogle(request.body);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(result.statusCode).send(result.data);
  });
}
