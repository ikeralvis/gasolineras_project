import bcrypt from 'bcryptjs';
import { adminOnlyHook, verifyJwt } from '../hooks/authHooks.js';
import { validateStrongPassword, validateEmail, sanitizeName } from '../utils/validators.js';

const SALT_ROUNDS = 10;

// Esquemas OpenAPI
const authSchemas = {
    register: {
        tags: ['Auth'],
        summary: 'Registrar nuevo usuario',
        body: {
            type: 'object',
            required: ['nombre', 'email', 'password'],
            properties: {
                nombre: { type: 'string', minLength: 1, description: 'Nombre del usuario' },
                email: { type: 'string', format: 'email', description: 'Email único del usuario' },
                password: { type: 'string', minLength: 8, description: 'Contraseña (mín 8 chars, mayúsculas, minúsculas, números y símbolos)' }
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
        tags: ['Auth'],
        summary: 'Iniciar sesión',
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
                description: 'Login exitoso',
                type: 'object',
                properties: {
                    token: { type: 'string', description: 'JWT token de autenticación' }
                }
            },
            401: { description: 'Credenciales inválidas', type: 'object', properties: { error: { type: 'string' } } }
        }
    },
    me: {
        tags: ['Auth'],
        summary: 'Obtener perfil del usuario autenticado',
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
        tags: ['Auth'],
        summary: 'Listar todos los usuarios (solo admin)',
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

    // POST /register (PÚBLICA) - Con rate limiting
    fastify.post('/register', { 
        schema: authSchemas.register,
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '15 minutes'
            }
        }
    }, async (request, reply) => {
        const { nombre, email, password } = request.body;

        // Validar email con validador robusto
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return reply.code(400).send({ error: emailValidation.error });
        }

        // Validar contraseña fuerte
        const passwordValidation = validateStrongPassword(password);
        if (!passwordValidation.valid) {
            return reply.code(400).send({ error: passwordValidation.error });
        }

        try {
            const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
            const nombreSanitizado = sanitizeName(nombre);

            const query = `
                INSERT INTO users (nombre, email, password_hash)
                VALUES ($1, $2, $3)
                RETURNING id, nombre, email;
            `;
            const result = await fastify.pg.query(query, [nombreSanitizado, email.toLowerCase(), password_hash]);

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

    // POST /login (PÚBLICA) - Con rate limiting estricto
    fastify.post('/login', { 
        schema: authSchemas.login,
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '15 minutes'
            }
        }
    }, async (request, reply) => {
        const { email, password } = request.body;
        try {
            const query = 'SELECT id, nombre, email, password_hash, is_admin FROM users WHERE email = $1;';
            const result = await fastify.pg.query(query, [email.toLowerCase()]);

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
                fastify.log.warn('JWT verification failed:', err.message);
                return reply.code(401).send({ error: 'Unauthorized' });
            }
        }
    }, async (request, reply) => {
        try {
            const query = 'SELECT id, nombre, email, is_admin, combustible_favorito FROM users WHERE id = $1;';
            const result = await fastify.pg.query(query, [request.user.id]);
            
            if (result.rows.length === 0) {
                return reply.code(404).send({ error: 'Usuario no encontrado' });
            }
            
            const user = result.rows[0];
            return reply.code(200).send({
                id: user.id,
                nombre: user.nombre,
                email: user.email,
                is_admin: user.is_admin,
                combustible_favorito: user.combustible_favorito
            });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Error interno del servidor' });
        }
    });

    // PATCH /me - Actualizar perfil
    fastify.patch('/me', {
        schema: {
            tags: ['Auth'],
            summary: 'Actualizar perfil del usuario',
            security: [{ BearerAuth: [] }],
            body: {
                type: 'object',
                properties: {
                    nombre: { type: 'string', minLength: 1 },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    combustible_favorito: { type: 'string', enum: ['Precio Gasolina 95 E5', 'Precio Gasolina 98 E5', 'Precio Gasoleo A', 'Precio Gasoleo B', 'Precio Gasoleo Premium'] }
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
        onRequest: [verifyJwt] // ✅ Usar hook en lugar de inline
    }, async (request, reply) => {
        const user_id = request.user.id;
        const { nombre, email, password, combustible_favorito } = request.body;
        
        try {
            const updates = [];
            const values = [];
            let paramIndex = 1;
            
            if (nombre) {
                updates.push(`nombre = $${paramIndex++}`);
                values.push(sanitizeName(nombre));
            }
            
            if (email) {
                // Validar email
                const emailValidation = validateEmail(email);
                if (!emailValidation.valid) {
                    return reply.code(400).send({ error: emailValidation.error });
                }

                // Verificar que el email no esté en uso
                const checkQuery = 'SELECT id FROM users WHERE email = $1 AND id != $2;';
                const checkResult = await fastify.pg.query(checkQuery, [email.toLowerCase(), user_id]);
                if (checkResult.rows.length > 0) {
                    return reply.code(400).send({ error: 'El email ya está en uso.' });
                }
                updates.push(`email = $${paramIndex++}`);
                values.push(email.toLowerCase());
            }
            
            if (password) {
                // Validar contraseña fuerte
                const passwordValidation = validateStrongPassword(password);
                if (!passwordValidation.valid) {
                    return reply.code(400).send({ error: passwordValidation.error });
                }

                const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
                updates.push(`password_hash = $${paramIndex++}`);
                values.push(password_hash);
            }
            
            if (combustible_favorito) {
                updates.push(`combustible_favorito = $${paramIndex++}`);
                values.push(combustible_favorito);
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
            tags: ['Auth'],
            summary: 'Eliminar cuenta de usuario',
            security: [{ BearerAuth: [] }],
            response: {
                200: { type: 'object', properties: { message: { type: 'string' } } },
                401: { type: 'object', properties: { error: { type: 'string' } } },
                404: { type: 'object', properties: { error: { type: 'string' } } }
            }
        },
        onRequest: [verifyJwt] // ✅ Usar hook en lugar de inline
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
                    fastify.log.warn('JWT verification failed:', err.message);
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

    // ========================================
    // 🔐 GOOGLE OAUTH 2.0
    // ========================================

    // POST /google/internal - Endpoint interno para crear/obtener usuario de Google
    // Solo debe ser llamado por el gateway (no expuesto públicamente)
    // El frontend usa @react-oauth/google y envía el credential al gateway,
    // que verifica con Google y luego llama a este endpoint
    fastify.post('/google/internal', {
        schema: {
            tags: ['Auth'],
            summary: 'Crear/obtener usuario de Google (interno)',
            description: 'Endpoint interno usado por el gateway para procesar OAuth',
            body: {
                type: 'object',
                required: ['google_id', 'email', 'name'],
                properties: {
                    google_id: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    name: { type: 'string' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        token: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { google_id, email, name } = request.body;

        try {
            // Buscar o crear usuario
            let user;
            const existingUserQuery = 'SELECT id, nombre, email, is_admin, google_id FROM users WHERE email = $1;';
            const existingUserResult = await fastify.pg.query(existingUserQuery, [email.toLowerCase()]);

            if (existingUserResult.rows.length > 0) {
                // Usuario existe - actualizar google_id si no lo tiene
                user = existingUserResult.rows[0];
                if (!user.google_id) {
                    await fastify.pg.query(
                        'UPDATE users SET google_id = $1 WHERE id = $2',
                        [google_id, user.id]
                    );
                }
            } else {
                // Crear nuevo usuario
                const insertQuery = `
                    INSERT INTO users (nombre, email, password_hash, google_id)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id, nombre, email, is_admin;
                `;
                // Generar password hash aleatorio para usuarios de Google (no lo usarán)
                const randomPassword = await bcrypt.hash(Math.random().toString(36), SALT_ROUNDS);
                const insertResult = await fastify.pg.query(insertQuery, [
                    name,
                    email.toLowerCase(),
                    randomPassword,
                    google_id
                ]);
                user = insertResult.rows[0];
            }

            // Generar JWT
            const token = fastify.jwt.sign(
                { id: user.id, email: user.email, is_admin: user.is_admin, nombre: user.nombre },
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
            );

            fastify.log.info(`✅ Usuario Google procesado: ${email}`);

            return reply.code(200).send({ token });

        } catch (err) {
            fastify.log.error('Error en Google internal:', err);
            return reply.code(500).send({ error: 'Error interno del servidor' });
        }
    });
}