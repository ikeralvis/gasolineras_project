// Esquemas OpenAPI
const favSchemas = {
    addFavorite: {
        security: [{ BearerAuth: [] }], // ⭐ AÑADIDO
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
            200: { type: 'object', properties: { message: { type: 'string' }, ideess: { type: 'string' } } },
            401: { type: 'object', properties: { error: { type: 'string' } } },
            500: { type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    getFavorites: {
        security: [{ BearerAuth: [] }], // ⭐ AÑADIDO
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
            401: { type: 'object', properties: { error: { type: 'string' } } },
            500: { type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    deleteFavorite: {
        security: [{ BearerAuth: [] }], // ⭐ AÑADIDO
        params: {
            type: 'object',
            properties: {
                ideess: { type: 'string' }
            },
            required: ['ideess']
        },
        response: {
            200: { type: 'object', properties: { message: { type: 'string' } } },
            404: { type: 'object', properties: { error: { type: 'string' } } },
            401: { type: 'object', properties: { error: { type: 'string' } } },
            500: { type: 'object', properties: { error: { type: 'string' } } }
        }
    }
};

/**
 * Rutas de favoritos (Requiere JWT)
 */
export async function favoritesRoutes(fastify) {
    // POST /favoritos (PROTEGIDA)
    fastify.post('/favoritos', {
        schema: favSchemas.addFavorite,
        onRequest: async (request, reply) => {
            try {
                await request.jwtVerify();
            } catch (err) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
        }
    }, async (request, reply) => {
        const user_id = request.user.id;
        const { ideess } = request.body;
        
        try {
            const query = `
                INSERT INTO user_favorites (user_id, ideess)
                VALUES ($1, $2)
                ON CONFLICT (user_id, ideess) DO NOTHING
                RETURNING ideess;
            `;
            const result = await fastify.pg.query(query, [user_id, ideess]);
            
            if (result.rowCount === 0) {
                return reply.code(200).send({ message: 'Favorito ya existe.', ideess });
            } else {
                return reply.code(201).send({ message: 'Favorito añadido.', ideess: result.rows[0].ideess });
            }
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });

    // GET /favoritos (PROTEGIDA)
    fastify.get('/favoritos', {
        schema: favSchemas.getFavorites,
        onRequest: async (request, reply) => {
            try {
                await request.jwtVerify();
            } catch (err) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
        }
    }, async (request, reply) => {
        const user_id = request.user.id;
        
        try {
            const query = 'SELECT ideess, created_at FROM user_favorites WHERE user_id = $1 ORDER BY created_at DESC;';
            const result = await fastify.pg.query(query, [user_id]);
            return reply.code(200).send(result.rows);
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });

    // DELETE /favoritos/:ideess - Eliminar favorito
    fastify.delete('/favoritos/:ideess', {
        schema: favSchemas.deleteFavorite,
        onRequest: async (request, reply) => {
            try {
                await request.jwtVerify();
            } catch (err) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
        }
    }, async (request, reply) => {
        const user_id = request.user.id;
        const { ideess } = request.params;
        
        try {
            const query = 'DELETE FROM user_favorites WHERE user_id = $1 AND ideess = $2 RETURNING ideess;';
            const result = await fastify.pg.query(query, [user_id, ideess]);
            
            if (result.rowCount === 0) {
                return reply.code(404).send({ error: 'Favorito no encontrado.' });
            }
            
            return reply.code(200).send({ message: 'Favorito eliminado correctamente.' });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });
}