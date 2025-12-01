import { verifyJwt } from '../hooks/authHooks.js';

// Esquemas OpenAPI
const favSchemas = {
    addFavorite: {
        tags: ['Favoritos'],
        description: 'Añadir una gasolinera a favoritos',
        security: [{ BearerAuth: [] }],
        body: {
            type: 'object',
            required: ['ideess'],
            properties: {
                ideess: { 
                    type: 'string', 
                    description: 'ID de la Estación de Servicio'
                }
            },
            additionalProperties: false
        },
        response: {
            201: { 
                description: 'Favorito añadido exitosamente',
                type: 'object', 
                properties: { 
                    message: { type: 'string' }, 
                    ideess: { type: 'string' } 
                } 
            },
            200: { 
                description: 'Favorito ya existe',
                type: 'object', 
                properties: { 
                    message: { type: 'string' }, 
                    ideess: { type: 'string' } 
                } 
            },
            401: { description: 'No autenticado', type: 'object', properties: { error: { type: 'string' } } },
            500: { description: 'Error del servidor', type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    getFavorites: {
        tags: ['Favoritos'],
        description: 'Obtener lista de gasolineras favoritas del usuario',
        security: [{ BearerAuth: [] }],
        response: {
            200: {
                description: 'Lista de favoritos',
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        ideess: { type: 'string', description: 'ID de la gasolinera' },
                        created_at: { type: 'string', format: 'date-time', description: 'Fecha de creación' }
                    }
                }
            },
            401: { description: 'No autenticado', type: 'object', properties: { error: { type: 'string' } } },
            500: { description: 'Error del servidor', type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    deleteFavorite: {
        tags: ['Favoritos'],
        description: 'Eliminar una gasolinera de favoritos',
        security: [{ BearerAuth: [] }],
        params: {
            type: 'object',
            properties: {
                ideess: { type: 'string', description: 'ID de la gasolinera a eliminar' }
            },
            required: ['ideess']
        },
        response: {
            200: { description: 'Favorito eliminado', type: 'object', properties: { message: { type: 'string' } } },
            404: { description: 'Favorito no encontrado', type: 'object', properties: { error: { type: 'string' } } },
            401: { description: 'No autenticado', type: 'object', properties: { error: { type: 'string' } } },
            500: { description: 'Error del servidor', type: 'object', properties: { error: { type: 'string' } } }
        }
    }
};

/**
 * Rutas de favoritos (Requiere JWT)
 */
export async function favoritesRoutes(fastify) {
    // POST /favoritos (PROTEGIDA)
    fastify.post('/favoritos', {
        schema: {
            ...favSchemas.addFavorite,
            tags: ['Favoritos'],
            summary: 'Añadir un favorito (requiere JWT)',
        },
        onRequest: [verifyJwt] // <--- APLICAMOS HOOK AQUÍ
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
                fastify.log.error(err);
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
    
    // DELETE /favoritos/:ideess (PROTEGIDA)
    fastify.delete('/favoritos/:ideess', {
        schema: {
            tags: ['Favoritos'],
            summary: 'Eliminar un favorito (requiere JWT)',
            security: [{ BearerAuth: [] }],
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
                401: { type: 'object', properties: { error: { type: 'string' } } }
            }
        },
        onRequest: [verifyJwt] // ✅ Usar hook en lugar de inline
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

    // ========================================
    // 🔐 ENDPOINTS INTERNOS (solo gateway/servicios)
    // ========================================

    // GET /favoritos/all-ideess - Obtener todos los IDEESS favoritos (interno)
    // Usado por gasolineras-service para guardar solo histórico de favoritas
    fastify.get('/favoritos/all-ideess', {
        schema: {
            tags: ['Favoritos'],
            summary: 'Obtener todos los IDEESS favoritos (interno)',
            description: 'Endpoint interno para obtener lista única de IDEESS favoritos de todos los usuarios',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        count: { type: 'integer' },
                        ideess: { 
                            type: 'array',
                            items: { type: 'string' }
                        }
                    }
                },
                403: { type: 'object', properties: { error: { type: 'string' } } }
            }
        },
        // 🔐 Validar secret interno
        onRequest: async (request, reply) => {
            const internalSecret = request.headers['x-internal-secret'];
            const expectedSecret = process.env.INTERNAL_API_SECRET || 'dev-internal-secret-change-in-production';
            
            if (!internalSecret || internalSecret !== expectedSecret) {
                fastify.log.warn('⚠️ Intento de acceso a /favoritos/all-ideess sin secret válido');
                return reply.code(403).send({ error: 'Forbidden: Invalid internal secret' });
            }
        }
    }, async (request, reply) => {
        try {
            // Obtener todos los IDEESS únicos de favoritos
            const query = 'SELECT DISTINCT ideess FROM user_favorites;';
            const result = await fastify.pg.query(query);
            
            const ideessList = result.rows.map(row => row.ideess);
            
            fastify.log.info(`📊 Total IDEESS favoritos únicos: ${ideessList.length}`);
            
            return reply.code(200).send({
                count: ideessList.length,
                ideess: ideessList
            });
        } catch (error) {
            fastify.log.error('Error obteniendo IDEESS favoritos:', error);
            return reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });

}