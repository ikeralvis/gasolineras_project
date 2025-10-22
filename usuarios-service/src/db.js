import { fastifyPostgres } from '@fastify/postgres';
import 'dotenv/config';

/**
 * Plugin de base de datos para Fastify
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function dbPlugin(fastify) {
  fastify.register(fastifyPostgres, {
    connectionString: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
    // Usar 'pg' directamente a través de 'db'
  });
}