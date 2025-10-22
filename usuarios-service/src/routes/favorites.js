// Esquemas OpenAPI
const favSchemas = {
  addFavorite: {
    body: {
      type: 'object',
      required: ['ideess'],
      properties: {
        ideess: { type: 'string', description: 'ID de Estación de Servicio de la API pública' }
      },
      additionalProperties: false
    },
    response: {
      201: { type: 'object', properties: { message: { type: 'string' }, ideess: { type: 'string' } } },
      400: { type: 'object', properties: { error: { type: 'string' } } },
      401: { type: 'object', properties: { error: { type: 'string' } } }
    }
  },
  getFavorites: {
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ideess: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' }
          }
        }
      },
      401: { type: 'object', properties: { error: { type: 'string' } } }
    }
  }
};

/**
 * Rutas de favoritos (Requiere JWT)
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function favoritesRoutes(fastify) {

  // POST /favoritos
  fastify.post('/favoritos', { schema: favSchemas.addFavorite }, async (request, reply) => {
    // User ID viene del token verificado por el hook en authRoutes
    const user_id = request.user.id;
    const { ideess } = request.body;

    try {
      // Usar ON CONFLICT DO NOTHING para evitar duplicados y errores
      const query = `
        INSERT INTO user_favorites (user_id, ideess)
        VALUES ($1, $2)
        ON CONFLICT (user_id, ideess) DO NOTHING
        RETURNING ideess;
      `;
      const result = await fastify.pg.query(query, [user_id, ideess]);

      if (result.rowCount === 0) {
         reply.code(200).send({ message: 'Favorito ya existe.', ideess });
      } else {
         reply.code(201).send({ message: 'Favorito añadido.', ideess: result.rows[0].ideess });
      }

    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({ error: 'Error interno del servidor.' });
    }
  });

  // GET /favoritos
  fastify.get('/favoritos', { schema: favSchemas.getFavorites }, async (request, reply) => {
    const user_id = request.user.id;

    try {
      const query = 'SELECT ideess, created_at FROM user_favorites WHERE user_id = $1 ORDER BY created_at DESC;';
      const result = await fastify.pg.query(query, [user_id]);
      reply.code(200).send(result.rows);
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({ error: 'Error interno del servidor.' });
    }
  });
}