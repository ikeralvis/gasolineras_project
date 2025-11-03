// src/hooks/authHooks.js

/**
 * Hook de autenticación con JWT (para rutas protegidas).
 * Se usa en onRequest o preHandler.
 */
export async function verifyJwt(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

/**
 * Hook para restringir acceso a administradores.
 * Debe usarse junto con verifyJwt.
 */
export async function adminOnlyHook(request, reply) {
  if (!request.user || request.user.is_admin !== true) {
    return reply.code(403).send({ error: 'Forbidden: Admin access required' });
  }
}
