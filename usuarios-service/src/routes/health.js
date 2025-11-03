/**
 * Endpoint de healthcheck para verificar el estado del microservicio
 * Útil para orquestadores de contenedores (Docker, Kubernetes) y monitoreo
 */

/**
 * Rutas de healthcheck
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function healthRoutes(fastify) {
    
    // GET /health - Healthcheck básico
    fastify.get('/health', {
        schema: {
            tags: ['Health'],
            summary: 'Verificar estado del servicio',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', enum: ['ok', 'degraded', 'error'] },
                        uptime: { type: 'number', description: 'Tiempo en segundos desde que inició el servidor' },
                        timestamp: { type: 'string', format: 'date-time' },
                        database: { 
                            type: 'object',
                            properties: {
                                status: { type: 'string', enum: ['connected', 'disconnected', 'error'] },
                                responseTime: { type: 'number', description: 'Tiempo de respuesta en ms' }
                            }
                        },
                        version: { type: 'string' }
                    }
                },
                503: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        error: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        let dbStatus = 'disconnected';
        let dbResponseTime = null;
        let overallStatus = 'ok';
        
        try {
            const startTime = Date.now();
            const client = await fastify.pg.connect();
            
            // Ping básico a la base de datos
            await client.query('SELECT 1 as ping');
            
            dbResponseTime = Date.now() - startTime;
            dbStatus = 'connected';
            client.release();
            
            // Si la DB responde lento (>1000ms), marcar como degraded
            if (dbResponseTime > 1000) {
                overallStatus = 'degraded';
            }
            
        } catch (err) {
            fastify.log.error('Health check DB error:', err);
            dbStatus = 'error';
            
            // Retornar 503 si la DB no está disponible
            return reply.code(503).send({
                status: 'error',
                error: 'Database connection failed',
                database: {
                    status: dbStatus,
                    responseTime: dbResponseTime
                },
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        }

        return reply.code(200).send({
            status: overallStatus,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            database: {
                status: dbStatus,
                responseTime: dbResponseTime
            },
            version: process.env.npm_package_version || '1.0.0'
        });
    });

    // GET /ready - Readiness probe (para Kubernetes)
    fastify.get('/ready', {
        schema: {
            tags: ['Health'],
            summary: 'Verificar si el servicio está listo para recibir tráfico',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        ready: { type: 'boolean' }
                    }
                },
                503: {
                    type: 'object',
                    properties: {
                        ready: { type: 'boolean' },
                        reason: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            // Verificar que la base de datos esté disponible
            const client = await fastify.pg.connect();
            await client.query('SELECT 1');
            client.release();
            
            return reply.code(200).send({ ready: true });
        } catch (err) {
            fastify.log.error('Readiness check failed:', err);
            return reply.code(503).send({ 
                ready: false,
                reason: 'Database not available'
            });
        }
    });

    // GET /live - Liveness probe (para Kubernetes)
    fastify.get('/live', {
        schema: {
            tags: ['Health'],
            summary: 'Verificar si el servicio está vivo',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        alive: { type: 'boolean' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        // Liveness probe simple: si el servidor responde, está vivo
        return reply.code(200).send({ alive: true });
    });
}
