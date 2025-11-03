/**
 * Middleware global de manejo de errores para Fastify
 * Centraliza el manejo de errores comunes y proporciona respuestas consistentes
 */

/**
 * Plugin de Fastify para registrar el error handler global
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function errorHandler(fastify) {
    fastify.setErrorHandler((error, request, reply) => {
        // Logging estructurado del error
        fastify.log.error({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            url: request.url,
            method: request.method,
            statusCode: error.statusCode || 500,
            code: error.code
        });

        // Errores de validación de Fastify/JSON Schema
        if (error.validation) {
            return reply.code(400).send({
                error: 'Error de validación',
                message: 'Los datos proporcionados no son válidos',
                details: error.validation.map(v => ({
                    field: v.instancePath || v.params?.missingProperty,
                    message: v.message
                }))
            });
        }

        // Errores de JWT
        if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
            return reply.code(401).send({ 
                error: 'Token no proporcionado',
                message: 'Se requiere autenticación para acceder a este recurso'
            });
        }

        if (error.code === 'FST_JWT_BAD_REQUEST' || error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
            return reply.code(401).send({ 
                error: 'Token inválido',
                message: 'El token de autenticación no es válido'
            });
        }

        if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
            return reply.code(401).send({ 
                error: 'Token expirado',
                message: 'El token de autenticación ha expirado'
            });
        }

        // Errores de base de datos PostgreSQL
        if (error.code?.startsWith('23')) {
            // 23505: unique_violation
            if (error.code === '23505') {
                return reply.code(409).send({ 
                    error: 'Conflicto de duplicación',
                    message: 'El recurso ya existe en la base de datos'
                });
            }
            // 23503: foreign_key_violation
            if (error.code === '23503') {
                return reply.code(400).send({ 
                    error: 'Referencia inválida',
                    message: 'El recurso referenciado no existe'
                });
            }
            // Otros errores de integridad
            return reply.code(409).send({ 
                error: 'Conflicto en base de datos',
                message: 'No se pudo completar la operación debido a restricciones de datos'
            });
        }

        // Errores de rate limiting
        if (error.statusCode === 429) {
            return reply.code(429).send({
                error: 'Demasiadas solicitudes',
                message: 'Has excedido el límite de solicitudes. Intenta de nuevo más tarde.',
                retryAfter: reply.getHeader('Retry-After')
            });
        }

        // Errores 404 (ruta no encontrada)
        if (error.statusCode === 404) {
            return reply.code(404).send({
                error: 'Recurso no encontrado',
                message: 'La ruta solicitada no existe'
            });
        }

        // Errores 403 (Forbidden)
        if (error.statusCode === 403) {
            return reply.code(403).send({
                error: 'Acceso denegado',
                message: 'No tienes permisos para acceder a este recurso'
            });
        }

        // Error genérico 500
        return reply.code(error.statusCode || 500).send({
            error: 'Error interno del servidor',
            message: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'Ha ocurrido un error inesperado. Por favor, intenta de nuevo más tarde.'
        });
    });

    // Handler para rutas no encontradas (404)
    fastify.setNotFoundHandler((request, reply) => {
        reply.code(404).send({
            error: 'Ruta no encontrada',
            message: `La ruta ${request.method} ${request.url} no existe en este servidor`
        });
    });
}
