export function buildInternalAuthHook({ fastify, settings }) {
  return async function verifyInternalSecret(request, reply) {
    if (!settings.useInternalApiSecret) {
      return;
    }

    const internalSecret = request.headers['x-internal-secret'];
    if (!internalSecret || internalSecret !== settings.internalApiSecret) {
      fastify.log.warn('Intento de acceso interno sin secret válido');
      return reply.code(403).send({ error: 'Forbidden: Invalid internal secret' });
    }
  };
}
