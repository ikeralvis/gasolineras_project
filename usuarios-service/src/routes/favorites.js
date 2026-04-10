import { verifyJwt } from '../hooks/authHooks.js';

export async function favoritesRoutes(fastify) {
  const favoriteService = fastify.services.favoriteService;
  const verifyInternalSecret = fastify.verifyInternalSecret;

  fastify.post('/favoritos', {
    schema: {
      tags: ['Favoritos'],
      summary: 'Añadir favorito',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        required: ['ideess'],
        properties: { ideess: { type: 'string' } },
        additionalProperties: false,
      },
    },
    onRequest: [verifyJwt],
  }, async (request, reply) => {
    const result = await favoriteService.addFavorite(request.user.id, request.body.ideess);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(result.statusCode).send(result.data);
  });

  fastify.get('/favoritos', {
    schema: {
      tags: ['Favoritos'],
      summary: 'Listar favoritos del usuario',
      security: [{ BearerAuth: [] }],
    },
    onRequest: [verifyJwt],
  }, async (request, reply) => {
    const result = await favoriteService.listFavorites(request.user.id);
    return reply.code(result.statusCode).send(result.data);
  });

  fastify.delete('/favoritos/:ideess', {
    schema: {
      tags: ['Favoritos'],
      summary: 'Eliminar favorito',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { ideess: { type: 'string' } },
        required: ['ideess'],
      },
    },
    onRequest: [verifyJwt],
  }, async (request, reply) => {
    const result = await favoriteService.deleteFavorite(request.user.id, request.params.ideess);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(result.statusCode).send(result.data);
  });

  // Endpoint de resiliencia para IDs obsoletos en favoritos.
  fastify.post('/favoritos/reconcile', {
    schema: {
      tags: ['Favoritos'],
      summary: 'Reconciliar favoritos contra gasolineras-service',
      security: [{ BearerAuth: [] }],
    },
    onRequest: [verifyJwt],
  }, async (request, reply) => {
    const result = await favoriteService.reconcileFavorites(request.user.id);
    return reply.code(result.statusCode).send(result.data);
  });

  fastify.get('/favoritos/all-ideess', {
    schema: {
      tags: ['Favoritos'],
      summary: 'Obtener IDEESS favoritos (interno)',
    },
    onRequest: [verifyInternalSecret],
  }, async (request, reply) => {
    const result = await favoriteService.listAllIdeess();
    return reply.code(result.statusCode).send(result.data);
  });

  fastify.get('/favoritos/stats', {
    schema: {
      tags: ['Favoritos'],
      summary: 'Estadísticas de favoritos (interno)',
      querystring: {
        type: 'object',
        properties: {
          top_n: { type: 'integer', minimum: 1, maximum: 5000, default: 500 },
          min_favorites: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
        },
      },
    },
    onRequest: [verifyInternalSecret],
  }, async (request, reply) => {
    const topN = Number.parseInt(String(request.query?.top_n ?? 500), 10);
    const minFavorites = Number.parseInt(String(request.query?.min_favorites ?? 1), 10);
    const result = await favoriteService.favoritesStats(topN, minFavorites);
    return reply.code(result.statusCode).send(result.data);
  });
}
