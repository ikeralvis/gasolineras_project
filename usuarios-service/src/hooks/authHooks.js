/**
 * Hook de pre-handler para verificar si el usuario es administrador.
 * Asume que `request.jwtVerify()` ya se ha ejecutado.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export async function adminOnlyHook(request, reply) {
  if (!request.user || request.user.is_admin !== true) {
    // Es importante usar return reply.code(...) para detener la ejecución
    return reply.code(403).send({ error: 'Forbidden: Admin access required' });
  }
}