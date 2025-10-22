import bcrypt from 'bcryptjs';
import { adminOnlyHook } from '../hooks/authHooks.js';

const SALT_ROUNDS = 10;

// Esquemas OpenAPI
const authSchemas = {
    register: {
        body: {
            type: 'object',
            required: ['nombre', 'email', 'password'],
            properties: {
                nombre: { type: 'string', minLength: 1 },
                email: { type: 'string', format: 'email' },
                password: { type: 'string', minLength: 6 }
            },
            additionalProperties: false
        },
        response: {
            201: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    nombre: { type: 'string' },
                    email: { type: 'string' }
                }
            },
            400: { type: 'object', properties: { error: { type: 'string' } } },
            500: { type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    login: {
        body: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string' }
            },
            additionalProperties: false
        },
        response: {
            200: {
                type: 'object',
                properties: {
                    token: { type: 'string' }
                }
            },
            401: { type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    me: {
        response: {
            200: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    nombre: { type: 'string' },
                    email: { type: 'string' },
                    is_admin: { type: 'boolean' }
                }
            },
            401: { type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    listUsers: {
        response: {
            200: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        nombre: { type: 'string' },
                        email: { type: 'string' },
                        is_admin: { type: 'boolean' }
                    }
                }
            },
            403: { type: 'object', properties: { error: { type: 'string' } } }
        }
    }
};


/**
 * Rutas de autenticación y gestión de usuarios.
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function authRoutes(fastify) {
    // Hook para requerir JWT en todas las rutas de este scope (excepto register/login)
    fastify.addHook('onRequest', async (request, reply) => {
        // Excluimos las rutas públicas del hook de verificación
        if (request.url !== '/register' && request.url !== '/login' && request.url !== '/') {
            try {
                await request.jwtVerify();
                // request.user ahora contiene el payload del token
            } catch (err) {
                reply.code(401).send({ error: 'Unauthorized' });
            }
        }
    });

    // POST /register
    fastify.post('/register', { schema: authSchemas.register }, async (request, reply) => {
        const { nombre, email, password } = request.body;

        try {
            const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

            const query = `
        INSERT INTO users (nombre, email, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, nombre, email;
      `;
            const result = await fastify.pg.query(query, [nombre, email, password_hash]);

            if (result.rows.length === 0) {
                reply.code(500).send({ error: 'Fallo al registrar el usuario' });
                return;
            }

            reply.code(201).send(result.rows[0]);

        } catch (error) {
            if (error.code === '23505') { // Código de error de duplicado (unique violation) en PostgreSQL
                reply.code(400).send({ error: 'El email ya está registrado.' });
                return;
            }
            fastify.log.error(error);
            reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });

    // POST /login
    fastify.post('/login', { schema: authSchemas.login }, async (request, reply) => {
        const { email, password } = request.body;

        try {
            // ... (código de DB para obtener usuario)

            const isMatch = await bcrypt.compare(password, user.password_hash);

            if (!isMatch) {
                reply.code(401).send({ error: 'Credenciales inválidas.' });
                return;
            }

            // --- LÍNEA CLAVE AJUSTADA ---
            // El payload es lo que @fastify/jwt pondrá en request.user
            const token = fastify.jwt.sign(
                { id: user.id, email: user.email, is_admin: user.is_admin, nombre: user.nombre },
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
            );

            reply.code(200).send({ token });

        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });

    // GET /me (Requiere Auth)
    fastify.get('/me', { schema: authSchemas.me }, async (request, reply) => {
        // La información del usuario (id, nombre, email, is_admin) viene ahora de request.user
        const { id, nombre, email, is_admin } = request.user;
        reply.code(200).send({ id, nombre, email, is_admin });
    });
    
    // GET / (Lista usuarios, Requiere Auth y Admin)
    fastify.get('/', {
        schema: authSchemas.listUsers,
        onRequest: [adminOnlyHook]
    }, async (request, reply) => {
        try {
            const query = 'SELECT id, nombre, email, is_admin FROM users;';
            const result = await fastify.pg.query(query);
            reply.code(200).send(result.rows);
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });
}