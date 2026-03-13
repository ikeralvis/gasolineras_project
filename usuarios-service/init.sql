-- Crear tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    combustible_favorito VARCHAR(50) DEFAULT 'Precio Gasolina 95 E5',
    modelo_coche VARCHAR(255),
    tipo_combustible_coche VARCHAR(20),
    google_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migraciones para despliegues existentes en cloud
ALTER TABLE users ADD COLUMN IF NOT EXISTS modelo_coche VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tipo_combustible_coche VARCHAR(20);

-- Crear tabla de favoritos
CREATE TABLE IF NOT EXISTS user_favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ideess VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, ideess)
);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);