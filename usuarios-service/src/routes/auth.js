import bcrypt from 'bcryptjs';
import { adminOnlyHook } from '../hooks/authHooks.js';

const SALT_ROUNDS = 10;

// Esquemas OpenAPI
const authSchemas = {
    register: {
        tags: ['Autenticación'],
        description: 'Registrar un nuevo usuario en el sistema',
        body: {
            type: 'object',
            required: ['nombre', 'email', 'password'],
            properties: {
                nombre: { type: 'string', minLength: 1, example: 'Juan Pérez' },
                email: { type: 'string', format: 'email', example: 'juan@example.com' },
                password: { type: 'string', minLength: 6, example: 'password123' }
            },
            additionalProperties: false
        },
        response: {
            201: {
                description: 'Usuario creado exitosamente',
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    nombre: { type: 'string' },
                    email: { type: 'string' }
                }
            },
            400: { description: 'Email ya registrado o datos inválidos', type: 'object', properties: { error: { type: 'string' } } },
            500: { description: 'Error interno del servidor', type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    login: {
        tags: ['Autenticación'],
        description: 'Iniciar sesión y obtener token JWT',
        body: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
                email: { type: 'string', format: 'email', example: 'juan@example.com' },
                password: { type: 'string', example: 'password123' }
            },
            additionalProperties: false
        },
        response: {
            200: {
                description: 'Login exitoso',
                type: 'object',
                properties: {
                    token: { type: 'string', description: 'Token JWT válido por 7 días' }
                }
            },
            401: { description: 'Credenciales inválidas', type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    me: {
        tags: ['Perfil'],
        description: 'Obtener información del usuario autenticado',
        security: [{ BearerAuth: [] }],
        response: {
            200: {
                description: 'Información del usuario',
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    nombre: { type: 'string' },
                    email: { type: 'string' },
                    is_admin: { type: 'boolean' }
                }
            },
            401: { description: 'No autenticado', type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    updateMe: {
        tags: ['Perfil'],
        description: 'Actualizar información del usuario autenticado',
        security: [{ BearerAuth: [] }],
        body: {
            type: 'object',
            properties: {
                nombre: { type: 'string', minLength: 1 },
                email: { type: 'string', format: 'email' },
                password: { type: 'string', minLength: 6 }
            },
            additionalProperties: false,
            minProperties: 1
        },
        response: {
            200: {
                description: 'Perfil actualizado',
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    nombre: { type: 'string' },
                    email: { type: 'string' }
                }
            },
            400: { description: 'Datos inválidos o email ya en uso', type: 'object', properties: { error: { type: 'string' } } },
            401: { description: 'No autenticado', type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    deleteMe: {
        tags: ['Perfil'],
        description: 'Eliminar la cuenta del usuario autenticado',
        security: [{ BearerAuth: [] }],
        response: {
            200: { description: 'Cuenta eliminada', type: 'object', properties: { message: { type: 'string' } } },
            401: { description: 'No autenticado', type: 'object', properties: { error: { type: 'string' } } },
            404: { description: 'Usuario no encontrado', type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    listUsers: {
        tags: ['Admin'],
        description: 'Listar todos los usuarios (solo administradores)',
        security: [{ BearerAuth: [] }],
        response: {
            200: {
                description: 'Lista de usuarios',
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
            401: { description: 'No autenticado', type: 'object', properties: { error: { type: 'string' } } },
            403: { description: 'No tienes permisos de administrador', type: 'object', properties: { error: { type: 'string' } } }
        }
    }
};

/**
 * Rutas de autenticación y gestión de usuarios.
 */
export async function authRoutes(fastify) {
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
            return reply.code(200).send({ token });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Error interno del servidor.' });
        }
    });

    // GET /me (PROTEGIDA)
    fastify.get('/me', {
        schema: authSchemas.me,
        onRequest: async (request, reply) => {
            try {
                await request.jwtVerify();
            } catch (err) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
        }
    }, async (request, reply) => {
        const { id, nombre, email, is_admin } = request.user;
        return reply.code(200).send({ id, nombre, email, is_admin });
    });

    // PATCH /me - Actualizar perfil
    fastify.patch('/me', {
        schema: authSchemas.updateMe, // ⭐ USAR SCHEMA CORRECTO
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
        schema: authSchemas.deleteMe, // ⭐ USAR SCHEMA CORRECTO
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

    // GET / (Lista usuarios, PROTEGIDA y Admin)
    fastify.get('/', {
        schema: authSchemas.listUsers,
        onRequest: [
            async (request, reply) => {
                try {
                    await request.jwtVerify();
                } catch (err) {
                    return reply.code(401).send({ error: 'Unauthorized' });
                }
            },
            adminOnlyHook
        ]
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
}