import bcrypt from 'bcryptjs';
import { adminOnlyHook } from '../hooks/authHooks.js';

const SALT_ROUNDS = 10;

// Esquemas OpenAPI (Incluidos aquí para un único archivo)
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

    // Función reutilizable para verificar JWT
    const verifyJwt = async (request, reply) => {
        try {
            await request.jwtVerify();
        } catch (err) {
            // DEBE USAR return para detener la ejecución y enviar la respuesta
            return reply.code(401).send({ error: 'Unauthorized' });
        }
    };


    // POST /register (PÚBLICA)
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
                // Siempre usar return para salir de la función del handler
                return reply.code(500).send({ error: 'Fallo al registrar el usuario' });
            }

            return reply.code(201).send(result.rows[0]);

        } catch (error) {
            if (error.code === '23505') {
                return reply.code(400).send({ error: 'El email ya está registrado.' });
            }
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });

    // POST /login (PÚBLICA)
    fastify.post('/login', { schema: authSchemas.login }, async (request, reply) => {
        const { email, password } = request.body;

        try {
            const query = 'SELECT id, nombre, email, password_hash, is_admin FROM users WHERE email = $1;';
            const result = await fastify.pg.query(query, [email]);

            const user = result.rows[0];

            if (!user) {
                return reply.code(401).send({ error: 'Credenciales inválidas.' });
            }

            const isMatch = await bcrypt.compare(password, user.password_hash);

            if (!isMatch) {
                return reply.code(401).send({ error: 'Credenciales inválidas.' });
            }

            const token = fastify.jwt.sign(
                { id: user.id, email: user.email, is_admin: user.is_admin, nombre: user.nombre },
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
            );

            return reply.code(200).send({ token }); // Usar return aquí

        } catch (error) {
            fastify.log.error(error);
            // Este catch también maneja la falla de conexión a DB, devolviendo 500
            return reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });

    // GET /me (PROTEGIDA)
    fastify.get('/me', {
        schema: authSchemas.me,
        onRequest: [verifyJwt]
    }, async (request, reply) => {
        // request.user contiene el payload del token
        const { id, nombre, email, is_admin } = request.user;
        return reply.code(200).send({ id, nombre, email, is_admin });
    });

    // GET / (Lista usuarios, PROTEGIDA y Admin)
    fastify.get('/', {
        schema: authSchemas.listUsers,
        onRequest: [verifyJwt, adminOnlyHook]
    }, async (request, reply) => {
        try {
            const query = 'SELECT id, nombre, email, is_admin FROM users;';
            const result = await fastify.pg.query(query);
            return reply.code(200).send(result.rows);
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });

    // PATCH /me - Actualizar perfil
    fastify.patch('/me', {
        schema: {
            security: [{ BearerAuth: [] }],
            body: {
                type: 'object',
                properties: {
                    nombre: { type: 'string', minLength: 1 },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 }
                },
                additionalProperties: false,
                minProperties: 1 // Al menos un campo debe estar presente
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        nombre: { type: 'string' },
                        email: { type: 'string' }
                    }
                },
                400: { type: 'object', properties: { error: { type: 'string' } } },
                401: { type: 'object', properties: { error: { type: 'string' } } }
            }
        },
        onRequest: async (request, reply) => {
            try {
                await request.jwtVerify();
            } catch (err) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
        }
    }, async (request, reply) => {
        const user_id = request.user.id;
        const { nombre, email, password } = request.body;

        try {
            const updates = [];
            const values = [];
            let paramIndex = 1;

            if (nombre) {
                updates.push(`nombre = $${paramIndex++}`);
                values.push(nombre);
            }

            if (email) {
                // Verificar que el email no esté en uso
                const checkQuery = 'SELECT id FROM users WHERE email = $1 AND id != $2;';
                const checkResult = await fastify.pg.query(checkQuery, [email, user_id]);
                if (checkResult.rows.length > 0) {
                    return reply.code(400).send({ error: 'El email ya está en uso.' });
                }
                updates.push(`email = $${paramIndex++}`);
                values.push(email);
            }

            if (password) {
                const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
                updates.push(`password_hash = $${paramIndex++}`);
                values.push(password_hash);
            }

            if (updates.length === 0) {
                return reply.code(400).send({ error: 'No hay campos para actualizar.' });
            }

            values.push(user_id);
            const query = `
            UPDATE users 
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, nombre, email;
        `;

            const result = await fastify.pg.query(query, values);

            return reply.code(200).send(result.rows[0]);
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });
    // DELETE /me - Eliminar cuenta
    fastify.delete('/me', {
        schema: {
            security: [{ BearerAuth: [] }],
            response: {
                200: { type: 'object', properties: { message: { type: 'string' } } },
                401: { type: 'object', properties: { error: { type: 'string' } } }
            }
        },
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
            // ON DELETE CASCADE eliminará automáticamente los favoritos
            const query = 'DELETE FROM users WHERE id = $1 RETURNING id;';
            const result = await fastify.pg.query(query, [user_id]);

            if (result.rowCount === 0) {
                return reply.code(404).send({ error: 'Usuario no encontrado.' });
            }

            return reply.code(200).send({ message: 'Cuenta eliminada correctamente.' });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });
}