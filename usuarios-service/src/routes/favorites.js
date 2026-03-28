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
    const validateInternalSecret = async (request, reply) => {
        const internalSecret = request.headers['x-internal-secret'];
        const expectedSecret = process.env.INTERNAL_API_SECRET || 'dev-internal-secret-change-in-production';

        if (!internalSecret || internalSecret !== expectedSecret) {
            fastify.log.warn('⚠️ Intento de acceso a endpoint interno sin secret válido');
            return reply.code(403).send({ error: 'Forbidden: Invalid internal secret' });
        }
    };

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
        onRequest: validateInternalSecret
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

    // GET /favoritos/stats - Obtener IDEESS con número de favoritos (interno)
    // Soporta filtros de top N y mínimo de favoritos para selección de estaciones objetivo.
    fastify.get('/favoritos/stats', {
        schema: {
            tags: ['Favoritos'],
            summary: 'Obtener estadísticas de favoritos por IDEESS (interno)',
            description: 'Devuelve IDEESS con conteo de favoritos, ordenados descendentemente por popularidad',
            querystring: {
                type: 'object',
                properties: {
                    top_n: { type: 'integer', minimum: 1, maximum: 5000, default: 500 },
                    min_favorites: { type: 'integer', minimum: 1, maximum: 100000, default: 1 }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        count: { type: 'integer' },
                        top_n: { type: 'integer' },
                        min_favorites: { type: 'integer' },
                        stations: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    ideess: { type: 'string' },
                                    favorites_count: { type: 'integer' }
                                }
                            }
                        }
                    }
                },
                403: { type: 'object', properties: { error: { type: 'string' } } },
                500: { type: 'object', properties: { error: { type: 'string' } } }
            }
        },
        onRequest: validateInternalSecret
    }, async (request, reply) => {
        try {
            const topN = Number.parseInt(String(request.query?.top_n ?? 500), 10);
            const minFavorites = Number.parseInt(String(request.query?.min_favorites ?? 1), 10);
            const safeTopN = Number.isNaN(topN) ? 500 : Math.min(Math.max(topN, 1), 5000);
            const safeMinFavorites = Number.isNaN(minFavorites) ? 1 : Math.min(Math.max(minFavorites, 1), 100000);

            const query = `
                SELECT ideess, COUNT(*)::int AS favorites_count
                FROM user_favorites
                GROUP BY ideess
                HAVING COUNT(*) >= $1
                ORDER BY favorites_count DESC, ideess ASC
                LIMIT $2;
            `;

            const result = await fastify.pg.query(query, [safeMinFavorites, safeTopN]);
            const stations = result.rows.map((row) => ({
                ideess: row.ideess,
                favorites_count: Number(row.favorites_count),
            }));

            fastify.log.info(`📊 Favoritos stats: ${stations.length} IDEESS (top_n=${safeTopN}, min_favorites=${safeMinFavorites})`);

            return reply.code(200).send({
                count: stations.length,
                top_n: safeTopN,
                min_favorites: safeMinFavorites,
                stations,
            });
        } catch (error) {
            fastify.log.error('Error obteniendo estadísticas de favoritos:', error);
            return reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });

}