import { verifyJwt } from '../hooks/authHooks.js';

export async function brandPreferencesRoutes(fastify) {
  const brandPreferenceService = fastify.services.brandPreferenceService;

  fastify.put('/marcas-favoritas/:marca', {
    schema: {
      tags: ['MarcasFavoritas'],
      summary: 'Marcar/actualizar una marca como favorita (y si el usuario es socio)',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { marca: { type: 'string' } },
        required: ['marca'],
      },
      body: {
        type: 'object',
        properties: { es_socio: { type: 'boolean', default: false } },
        additionalProperties: false,
      },
    },
    onRequest: [verifyJwt],
  }, async (request, reply) => {
    const result = await brandPreferenceService.setBrandPreference(
      request.user.id,
      request.params.marca,
      request.body?.es_socio
    );
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(result.statusCode).send(result.data);
  });

  fastify.get('/marcas-favoritas', {
    schema: {
      tags: ['MarcasFavoritas'],
      summary: 'Listar marcas favoritas del usuario',
      security: [{ BearerAuth: [] }],
    },
    onRequest: [verifyJwt],
  }, async (request, reply) => {
    const result = await brandPreferenceService.listBrandPreferences(request.user.id);
    return reply.code(result.statusCode).send(result.data);
  });

  fastify.delete('/marcas-favoritas/:marca', {
    schema: {
      tags: ['MarcasFavoritas'],
      summary: 'Quitar una marca de favoritas',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { marca: { type: 'string' } },
        required: ['marca'],
      },
    },
    onRequest: [verifyJwt],
  }, async (request, reply) => {
    const result = await brandPreferenceService.deleteBrandPreference(request.user.id, request.params.marca);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(result.statusCode).send(result.data);
  });
}
